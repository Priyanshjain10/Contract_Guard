"""A3 — Risk Scorer Agent.

Groq DeepSeek-R1 (qwen/qwen3-32b) provides legal_base via
chain-of-thought reasoning. The full response (including <think> blocks) is
stored as reasoning_trace in AuditEvent — never fabricated.

semantic_sim is computed via ChromaDB cosine similarity against a
"high_risk_clauses" collection.  Falls back to 6.8 if ChromaDB is
unavailable or the collection is empty.
business_multiplier comes from the deterministic formula.py.
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import chromadb

from contractguard.models.audit import AuditEvent
from contractguard.models.clauses import ClauseInfo, RiskScore
from contractguard.models.state import ContractState
from contractguard.scoring.formula import business_multiplier, risk_score

try:
    from groq import Groq
except ImportError:  # pragma: no cover - optional in test/local environments
    Groq = None  # type: ignore[assignment]

# Fallback semantic similarity when ChromaDB is unavailable or collection is empty.
# 6.8 is intentionally calibrated as a moderate-risk default — not zero (which
# would under-score payment clauses) and not 10 (which would over-score everything).
# The exact value matters less than consistency: all clauses get the same fallback,
# so relative scoring between clauses remains meaningful even without vector search.
# To verify ChromaDB is seeded: python -m contractguard.scripts.seed_chroma
_SEMANTIC_SIM_DEFAULT: float = 6.8

_LEGAL_BASE_RE = re.compile(r"\b(?:score|legal[_\s]base|rating)[:\s]+([0-9]+(?:\.[0-9]+)?)\b", re.I)

if TYPE_CHECKING:
    from chromadb.api.models.Collection import Collection


def _get_chroma_collection() -> Collection | None:
    """Try to open the ChromaDB 'high_risk_clauses' collection."""
    try:
        import os as _os
        raw_path = _os.getenv("CHROMA_URL", "./chroma_db")
        # CHROMA_URL must be a local filesystem path.
        # HTTP/remote ChromaDB URLs are not supported; ./chroma_db is used as fallback.
        chroma_path = "./chroma_db" if raw_path.startswith("http") else _os.path.abspath(raw_path)
        client_chroma = chromadb.PersistentClient(path=chroma_path)
        collection = client_chroma.get_collection("high_risk_clauses")
        if collection.count() == 0:
            return None
        return collection
    except Exception:  # noqa: BLE001
        return None


def _semantic_sim(clause_text: str, collection: Collection | None) -> float:
    """Query ChromaDB for cosine similarity; return score 0-10."""
    if collection is None:
        return _SEMANTIC_SIM_DEFAULT
    try:
        results = collection.query(
            query_texts=[clause_text],
            n_results=1,
        )
        distances = results.get("distances", [[]])
        if distances and distances[0]:
            # ChromaDB returns cosine distance; similarity = 1 - distance
            distance = distances[0][0]
            raw_similarity = 1.0 - distance
            similarity_0_to_1 = max(0.0, min(raw_similarity, 1.0))
            return round(similarity_0_to_1 * 10, 2)
    except Exception:  # noqa: BLE001
        return _SEMANTIC_SIM_DEFAULT

_SYSTEM_PROMPT = """You are a senior Indian contract lawyer specialising in MSME disputes.
Evaluate the legal risk of a contract clause on a scale of 0–10, where:
  0 = completely standard, no legal risk
  10 = extremely one-sided / illegal under Indian law

Respond with:
1. Your full chain-of-thought reasoning (think through it step by step).
2. A final line in EXACTLY this format: LEGAL_BASE_SCORE: <number>

Do not fabricate case law. If uncertain, say so explicitly."""

_USER_TMPL = """\
Clause type: {clause_type}
Clause text: {clause_text}
Payment days (if applicable): {payment_days}

Rate the legal risk 0-10 and explain your reasoning."""


def _call_deepseek(client: Groq, clause: ClauseInfo) -> tuple[float, str]:
    """Call DeepSeek-R1 to get legal_base + full reasoning_trace."""
    user_msg = _USER_TMPL.format(
        clause_type=clause.clause_type,
        clause_text=clause.text,
        payment_days=clause.payment_days or "N/A",
    )
    response = client.chat.completions.create(
        model="qwen/qwen3-32b",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.1,
        max_tokens=1024,
    )
    full_text: str = response.choices[0].message.content or ""

    # Extract LEGAL_BASE_SCORE from the response
    m = _LEGAL_BASE_RE.search(full_text)
    if m:
        legal_base = min(float(m.group(1)), 10.0)
    else:
        # Fallback: use 7.0 for payment clauses, 5.0 for others
        legal_base = 7.0 if clause.clause_type == "payment_terms" else 5.0

    return legal_base, full_text


def _extract_payment_days(text: str) -> int | None:
    """Regex-extract payment days from clause text."""
    m = re.search(r"(\d+)\s*day", text, re.I)
    return int(m.group(1)) if m else None


async def risk_scorer(state: ContractState) -> dict:
    """Score each clause: Groq DeepSeek-R1 legal_base + ChromaDB semantic_sim."""
    profile = state.get("business_profile")
    sector_risk_weight = state.get("sector_risk_weight", None)
    clauses: list[ClauseInfo] = state.get("clauses", [])
    scores: list[RiskScore] = []
    audit_events: list[AuditEvent] = []

    # ChromaDB collection (None if unavailable)
    chroma_coll = _get_chroma_collection()

    groq_key = os.getenv("GROQ_API_KEY", "")
    use_groq = bool(groq_key) and Groq is not None
    client: Groq | None = Groq(api_key=groq_key) if use_groq else None

    for clause in clauses:
        # ── Legal base via DeepSeek-R1 (or fallback) ─────────────────────────
        if use_groq and client is not None:
            try:
                legal_base, reasoning_trace = _call_deepseek(client, clause)
            except Exception as exc:  # noqa: BLE001
                legal_base = 7.0 if clause.clause_type == "payment_terms" else 5.0
                reasoning_trace = (
                    f"Groq call failed: {exc}. Using fallback legal_base={legal_base}."
                )
        else:
            # No API key: deterministic fallback preserves demo invariants
            legal_base = 8.0 if clause.clause_type == "payment_terms" else 5.0
            reasoning_trace = (
                "GROQ_API_KEY not set — using deterministic fallback. "
                f"legal_base={legal_base} for clause_type={clause.clause_type}."
            )

        # ── Payment days: prefer extracted over regex ─────────────────────────
        payment_days = clause.payment_days
        if payment_days is None:
            payment_days = _extract_payment_days(clause.text)

        # ── Business multiplier (deterministic formula.py) ────────────────────
        biz_mult = 5.0
        if profile is not None and payment_days is not None:
            biz_mult = business_multiplier(
                profile,
                payment_days,
                sector_risk_weight_override=sector_risk_weight,
            )

        sem_sim = _semantic_sim(clause.text, chroma_coll)
        final = risk_score(legal_base, sem_sim, biz_mult)

        scores.append(
            RiskScore(
                clause_id=clause.clause_id,
                legal_base=round(legal_base, 2),
                semantic_similarity=sem_sim,
                business_multiplier=round(biz_mult, 2),
                final_score=round(final, 2),
                reasoning_trace=reasoning_trace,
            )
        )

        # Per-clause AuditEvent — every LLM call gets its own record
        audit_events.append(
            AuditEvent(
                agent_name="A3_risk_scorer",
                action="score_clause",
                input_snapshot={
                    "clause_id": clause.clause_id,
                    "clause_type": clause.clause_type,
                    "payment_days": payment_days,
                    "groq_used": use_groq,
                },
                output_snapshot={
                    "legal_base": round(legal_base, 2),
                    "semantic_sim": sem_sim,
                    "biz_mult": round(biz_mult, 2),
                    "final_score": round(final, 2),
                },
                reasoning_trace=reasoning_trace,
                timestamp=datetime.now(UTC),
            )
        )

    return {
        "risk_scores": scores,
        "audit_events": audit_events,
        "execution_logs": [
            {
                "agent": "A3_risk_scorer",
                "action": "score_clauses",
                "clause_count": len(scores),
                "max_score": round(
                    max((s.final_score for s in scores), default=0.0), 2
                ),
                "groq_used": use_groq,
            }
        ],
        "handoff_log": [
            "A3 → A5/A6/A7: scored "
            f"{len(scores)} clauses, max_score="
            f"{max((s.final_score for s in scores), default=0.0):.2f}"
        ],
    }
