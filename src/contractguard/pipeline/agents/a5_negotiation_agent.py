"""A5 — Negotiation Agent.

For each RiskScore where final_score > 6.0, call Groq
llama-3.3-70b-versatile to generate 3 contract clause rewrites:
  1. ideal   — maximum protection for the MSME
  2. compromise — realistic middle-ground
  3. minimum — walk-away line

Appends AuditEvent with full reasoning_trace for every LLM call.
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime

try:
    from groq import Groq
except ImportError:  # pragma: no cover - optional in test/local environments
    Groq = None  # type: ignore[assignment]

from contractguard.models.audit import AuditEvent
from contractguard.models.clauses import (
    ClauseInfo,
    NegotiationRewrite,
    RiskScore,
)
from contractguard.models.state import ContractState

_SYSTEM_PROMPT = """\
You are a senior Indian contract negotiation lawyer specialising in MSME protection.
Given a risky contract clause and its compliance context, produce exactly 3 rewrites.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation outside JSON):
{
  "ideal": {
    "text": "<rewritten clause — maximum MSME protection>",
    "reasoning": "<1-2 line rationale; reference Indian law only if applicable>"
  },
  "compromise": {
    "text": "<rewritten clause — realistic middle-ground both parties accept>",
    "reasoning": "<1-2 line rationale; no bracket tags or verbose chains>"
  },
  "minimum": {
    "text": "<rewritten clause — walk-away line for MSME>",
    "reasoning": "<1-2 line rationale; no bracket tags or verbose chains>"
  }
}

Rules (must follow):
1) If the clause is a payment term (e.g., payment dates, invoice payment, Net-xx), then
   rewrites MUST include:
   - Late payments shall accrue interest at 3× the RBI base rate (per annum) from the
     due date until payment.
   - Do NOT output any wording like "no interest" or "without interest".
2) If the clause is NOT a payment term (e.g., termination, liability, confidentiality):
   - Do NOT mention MSME Act Section 15 or MSME in the rewrite text/reasoning.
   - Do NOT mention RBI interest penalties.
"""

_USER_TMPL = """\
Original clause (risk score {score}/10):
{text}

Compliance context: {compliance_context}

Produce 3 rewrites as JSON: ideal, compromise, minimum."""

_REWRITE_RE = re.compile(
    r"(IDEAL|COMPROMISE|MINIMUM)\s*:\s*(.+?)(?=\n(?:IDEAL|COMPROMISE|MINIMUM)\s*:|$)",
    re.S | re.I,
)


def _parse_rewrites(
    raw: str,
    clause_id: str,
    original_text: str,
) -> list[NegotiationRewrite]:
    """Parse 3 labelled rewrites from LLM response."""
    matches = _REWRITE_RE.findall(raw)
    rewrites: list[NegotiationRewrite] = []

    label_scores = {
        "ideal": 3.0,
        "compromise": 2.0,
        "minimum": 1.0,
    }

    for label, body in matches:
        label_lower = label.strip().lower()
        rewrites.append(
            NegotiationRewrite(
                clause_id=clause_id,
                original_text=original_text,
                rewritten_text=body.strip(),
                risk_reduction=label_scores.get(
                    label_lower, 1.5
                ),
                reasoning=f"{label.strip()} rewrite",
            )
        )

    return rewrites


def _fallback_rewrites(clause: ClauseInfo) -> list[NegotiationRewrite]:
    """Deterministic fallback rewrites when Groq is unavailable."""
    if clause.clause_type != "payment_terms":
        # Keep non-payment rewrites clause-type safe (no MSME/interest penalties).
        return [
            NegotiationRewrite(
                clause_id=clause.clause_id,
                original_text=clause.text,
                rewritten_text=(
                    "Any termination right shall be exercised reasonably, "
                    "with written notice and (where applicable) a cure period for material breach."
                ),
                risk_reduction=2.0,
                reasoning=(
                    "Align termination mechanics with fairness and reasonable notice, "
                    "reducing unilateral risk."
                ),
            ),
            NegotiationRewrite(
                clause_id=clause.clause_id,
                original_text=clause.text,
                rewritten_text=(
                    "This clause shall be limited to what is legally enforceable; "
                    "no termination or enforcement shall waive rights "
                    "for fraud or unlawful conduct."
                ),
                risk_reduction=1.5,
                reasoning="Preserves core legal protections while keeping the clause operational.",
            ),
            NegotiationRewrite(
                clause_id=clause.clause_id,
                original_text=clause.text,
                rewritten_text=(
                    "Termination provisions shall require objective grounds and proper "
                    "notice to avoid arbitrary action."
                ),
                risk_reduction=1.0,
                reasoning="Adds process safeguards; reduces risk without overreaching.",
            ),
        ]

    # Payment-term fallbacks: always include 3× RBI base-rate interest for late payments.
    return [
        NegotiationRewrite(
            clause_id=clause.clause_id,
            original_text=clause.text,
            rewritten_text=(
                "Payment shall be made within 30 days of invoice date (Net-30). "
                "Late payments shall accrue interest at 3× the RBI base rate "
                "per annum from the due date until payment."
            ),
            risk_reduction=3.0,
            reasoning=(
                "Ideal: Net-30 protects cash flow; late payments attract "
                "3× RBI base rate interest."
            ),
        ),
        NegotiationRewrite(
            clause_id=clause.clause_id,
            original_text=clause.text,
            rewritten_text=(
                "Payment shall be made within 45 days of invoice date (Net-45). "
                "Late payments shall accrue interest at 3× the RBI base rate "
                "per annum from the due date until payment."
            ),
            risk_reduction=2.0,
            reasoning=(
                "Compromise: Net-45 is a statutory ceiling while keeping the "
                "late-payment interest mechanism at 3× RBI."
            ),
        ),
        NegotiationRewrite(
            clause_id=clause.clause_id,
            original_text=clause.text,
            rewritten_text=(
                "Payment shall be made within 60 days of invoice date; "
                "any late payment beyond the due date "
                "shall accrue interest at 3× the RBI base rate "
                "per annum from the due date until payment."
            ),
            risk_reduction=1.0,
            reasoning=(
                "Minimum: Accepts a longer term but ensures late-payment "
                "financing cost at 3× RBI base rate."
            ),
        ),
    ]


def _truncate_to_2_sentences(text: str, max_chars: int = 180) -> str:
    cleaned = " ".join((text or "").replace("\n", " ").split())
    if not cleaned:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    out = " ".join(parts[:2]).strip()
    if len(out) > max_chars:
        out = out[: max_chars - 1].rstrip()
    return out


def _sanitize_payment_text(text: str) -> str:
    cleaned = text or ""
    # Remove any mention that suggests interest is absent.
    cleaned = re.sub(r"\b(no\s+interest|without\s+interest)\b[^.]*\.?", "", cleaned, flags=re.I)
    # Normalize interest rate to 3× RBI base rate where present.
    cleaned = re.sub(
        r"\b1\.5\s*[×x]\s*(?:the\s*)?RBI\s*base\s*rate\b",
        "3× the RBI base rate",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(
        r"\b(?:interest\s+)?at\s+\d+(?:\.\d+)?\s*[×x]\s*(?:the\s*)?RBI\s*base\s*rate\b",
        "interest at 3× the RBI base rate",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(r"Section\s*16", "Section 15", cleaned, flags=re.I)
    # Ensure the required late-payment sentence exists.
    if not re.search(r"3\s*[×x]\s*(?:the\s*)?RBI\s*base\s*rate", cleaned, flags=re.I):
        cleaned = cleaned.rstrip(".; ") + (
            ". Late payments shall accrue interest at 3× the RBI base rate"
            " per annum from the due date until payment."
        )
    if re.search(r"Late payments", cleaned, flags=re.I) and "accrue interest" not in cleaned:
        cleaned = cleaned.rstrip(".; ") + (
            ". Late payments shall accrue interest at 3× the RBI base rate"
            " per annum from the due date until payment."
        )
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def _sanitize_non_payment_text(text: str) -> str:
    cleaned = text or ""
    # Strip MSME/Section references and RBI interest penalty sentences.
    cleaned = re.sub(r"\bMSME\b[^.]*\.?", "", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"\bSection\s*15\b[^.]*\.?", "", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"\binterest\b[^.]*\bRBI\b[^.]*\.?", "", cleaned, flags=re.I | re.S)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def _sanitize_reasoning(reasoning: str, clause_type: str) -> str:
    cleaned = _truncate_to_2_sentences(reasoning or "", max_chars=190)
    if not cleaned:
        return cleaned
    # Remove bracket tags like [A3].
    cleaned = re.sub(r"\[[A-Za-z0-9_-]+\]\s*", "", cleaned)
    # Enforce no "no interest" wording.
    cleaned = re.sub(r"\b(no\s+interest|without\s+interest)\b[^.]*\.?", "", cleaned, flags=re.I)
    if clause_type == "payment_terms":
        if not re.search(r"3\s*[×x]\s*(?:the\s*)?RBI\s*base\s*rate", cleaned, flags=re.I):
            cleaned = (
                cleaned.rstrip(".; ")
                + " Late payments carry interest at 3× the RBI base rate."
            )
    else:
        cleaned = _sanitize_non_payment_text(cleaned)
    cleaned = cleaned.strip()
    if clause_type != "payment_terms" and not cleaned:
        return "Reduces risk while remaining legally enforceable."
    return cleaned


async def negotiation_agent(state: ContractState) -> dict:
    """Generate 3 rewrites per high-risk clause (score > 6.0)."""
    risk_scores: list[RiskScore] = state.get(
        "risk_scores", []
    )
    clauses: list[ClauseInfo] = state.get("clauses", [])
    clause_map: dict[str, ClauseInfo] = {
        c.clause_id: c for c in clauses
    }

    all_rewrites: list[NegotiationRewrite] = []
    audit_events: list[AuditEvent] = []

    # Build compliance context map: clause_id → violation details
    compliance_map: dict[str, str] = {}
    for cr in state.get("compliance_results", []):
        if cr.violation:
            compliance_map[cr.clause_id] = (
                "MSME Act Section 15 (payment terms): "
                f"{cr.excess_days} excess days; interest liability ₹{cr.interest_liability:,.0f} "
                "(computed using 3× RBI base rate)."
            )

    groq_key = os.getenv("GROQ_API_KEY", "")
    use_groq = bool(groq_key) and Groq is not None
    client: Groq | None = (
        Groq(api_key=groq_key) if use_groq and Groq is not None else None
    )

    for rs in risk_scores:
        clause = clause_map.get(rs.clause_id)
        if clause is None:
            continue
        # Generate rewrites for compliance violations even if risk_score is moderate.
        if rs.final_score <= 6.0 and clause.clause_id not in compliance_map:
            continue

        compliance_context = compliance_map.get(
            clause.clause_id, "No statutory violation detected."
        )

        if use_groq and client is not None:
            user_msg = _USER_TMPL.format(
                score=rs.final_score,
                text=clause.text,
                compliance_context=compliance_context,
            )
            try:
                response = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": _SYSTEM_PROMPT},
                        {"role": "user", "content": user_msg},
                    ],
                    temperature=0.3,
                    max_tokens=1024,
                    response_format={"type": "json_object"},
                )
                import json as _json

                raw = response.choices[0].message.content or "{}"
                parsed = _json.loads(raw)
                rewrites = []
                label_scores = {"ideal": 3.0, "compromise": 2.0, "minimum": 1.0}
                for label in ("ideal", "compromise", "minimum"):
                    entry = parsed.get(label, {})
                    rewrites.append(
                        NegotiationRewrite(
                            clause_id=clause.clause_id,
                            original_text=clause.text,
                            rewritten_text=entry.get(
                                "text", f"{label.upper()} rewrite unavailable"
                            ),
                            risk_reduction=label_scores[label],
                            reasoning=entry.get("reasoning", ""),
                        )
                    )
                reasoning_trace = raw
            except Exception as exc:  # noqa: BLE001
                # Fallback on any error (JSON parse, API failure, etc.)
                rewrites = _fallback_rewrites(clause)
                reasoning_trace = (
                    f"Groq/JSON error: {exc}. Using deterministic fallback."
                )
        else:
            rewrites = _fallback_rewrites(clause)
            reasoning_trace = (
                "GROQ_API_KEY not set — using deterministic fallback rewrites."
            )

        # Post-sanitize rewrites for clause-type correctness and required interest terms.
        sanitized_rewrites: list[NegotiationRewrite] = []
        for r in rewrites:
            rewritten_text = r.rewritten_text
            reasoning = r.reasoning
            if clause.clause_type == "payment_terms":
                rewritten_text = _sanitize_payment_text(rewritten_text)
            else:
                rewritten_text = _sanitize_non_payment_text(rewritten_text)
            reasoning = _sanitize_reasoning(reasoning, clause.clause_type)
            sanitized_rewrites.append(
                NegotiationRewrite(
                    clause_id=r.clause_id,
                    original_text=r.original_text,
                    rewritten_text=rewritten_text,
                    risk_reduction=r.risk_reduction,
                    reasoning=reasoning,
                )
            )

        all_rewrites.extend(sanitized_rewrites)

        audit_events.append(
            AuditEvent(
                agent_name="A5_negotiation_agent",
                action="generate_rewrites",
                input_snapshot={
                    "clause_id": clause.clause_id,
                    "final_score": rs.final_score,
                    "groq_used": use_groq,
                },
                output_snapshot={
                    "rewrite_count": len(rewrites),
                    "labels": [
                        r.reasoning for r in rewrites
                    ],
                },
                reasoning_trace=reasoning_trace,
                timestamp=datetime.now(UTC),
            )
        )

    return {
        "negotiation_rewrites": all_rewrites,
        "audit_events": audit_events,
        "execution_logs": [
            {
                "agent": "A5_negotiation_agent",
                "action": "generate_rewrites",
                "high_risk_clauses": len([rs for rs in risk_scores if rs.final_score > 6.0]),
                "total_rewrites": len(all_rewrites),
                "groq_used": use_groq,
            }
        ],
        "handoff_log": [
            "A5 → A6/A7: generated "
            f"{len(all_rewrites)} rewrite options from high-risk clauses"
        ],
    }
