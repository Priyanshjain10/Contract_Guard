"""Autonomy Loop — post-negotiation feedback cycle.

After A5 generates rewrites, this agent:
1. Drafts a negotiation email using the IDEAL rewrite
2. Simulates counterparty response (Groq or deterministic fallback)
3. Re-scores the revised clause to show risk reduction
4. Sets final_decision based on post-negotiation risk

This is the autonomy demonstration: the agent takes action,
observes a response, and updates its assessment — without human input.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime

try:
    from groq import Groq
except ImportError:
    Groq = None  # type: ignore[assignment]

from contractguard.models.audit import AuditEvent
from contractguard.models.clauses import RiskScore
from contractguard.models.state import ContractState
from contractguard.scoring.formula import risk_score

logger = logging.getLogger(__name__)

_EMAIL_SYSTEM = """You are a professional contract negotiator for an Indian MSME.
Write a brief, professional negotiation email requesting a clause change.
Be firm but respectful. Reference the MSME Development Act 2006 if relevant.
Keep it under 150 words."""

_SIM_SYSTEM = """You are simulating a counterparty response to a contract negotiation.
Respond ONLY with valid JSON:
{
  "outcome": "accepted" | "partial" | "rejected",
  "counter_proposal": "<their counter clause or empty string>",
  "reasoning": "<brief explanation>"
}
- accepted: 40% probability (they agree to IDEAL terms)
- partial: 45% probability (they accept COMPROMISE terms)
- rejected: 15% probability (they reject, need MINIMUM)"""


def _draft_email(clause_text: str, ideal_rewrite: str, compliance_detail: str) -> str:
    """Deterministic email draft (used as fallback or base)."""
    return (
        f"Dear Team,\n\n"
        f"We have reviewed the contract clause regarding payment terms.\n\n"
        f"Current clause: \"{clause_text[:100]}...\"\n\n"
        f"Compliance concern: {compliance_detail}\n\n"
        f"We propose the following revision:\n\"{ideal_rewrite}\"\n\n"
        f"This aligns with MSME Development Act 2006, Section 15, which caps "
        f"payment terms at 45 days for MSME suppliers. We look forward to your "
        f"acceptance of these standard terms.\n\n"
        f"Best regards,\nContractGuard MSME Advisory"
    )


async def autonomy_loop(state: ContractState) -> dict:
    """Run post-negotiation feedback loop.

    No-ops if: no high-risk clauses OR no negotiation rewrites exist.
    """
    risk_scores_list: list[RiskScore] = state.get("risk_scores", [])
    rewrites = state.get("negotiation_rewrites", [])
    compliance_results = state.get("compliance_results", [])
    gate_flags = state.get("gate_flags", {})

    # Only run if there is a critical risk
    has_critical = gate_flags.get("GATE2_critical_risk", False)
    if not has_critical or not rewrites:
        return {
            "final_decision": "NO_ACTION_REQUIRED — no critical risk clauses detected.",
            "negotiation_email_draft": "",
            "counterparty_simulation": {},
            "execution_logs": [
                {
                    "agent": "autonomy_loop",
                    "action": "skipped",
                    "reason": "no critical risk or no rewrites",
                }
            ],
            "handoff_log": ["Autonomy loop: skipped (no critical risk)"],
        }

    # Find the highest-risk clause with a rewrite
    clause_map = {c.clause_id: c for c in state.get("clauses", [])}
    compliance_map = {cr.clause_id: cr for cr in compliance_results if cr.violation}

    # Pick the highest-scoring clause that has rewrites (no hard threshold).
    # This keeps the autonomy demo robust when legal_base/semantic signals vary
    # (e.g., Groq output can keep final_score below 8 even for real violations).
    rewrite_clause_ids = {r.clause_id for r in rewrites}
    target_score = max(
        (rs for rs in risk_scores_list if rs.clause_id in rewrite_clause_ids),
        key=lambda x: x.final_score,
        default=None,
    )

    if target_score is None:
        return {
            "final_decision": "REVIEW_REQUIRED — critical risk detected but no rewrites available.",
            "negotiation_email_draft": "",
            "counterparty_simulation": {},
            "execution_logs": [{"agent": "autonomy_loop", "action": "no_rewrite_found"}],
            "handoff_log": ["Autonomy loop: no matching rewrite found"],
        }

    clause = clause_map.get(target_score.clause_id)
    compliance = compliance_map.get(target_score.clause_id)
    clause_rewrites = [r for r in rewrites if r.clause_id == target_score.clause_id]
    ideal_rewrite = next(
        (r for r in clause_rewrites if r.risk_reduction == 3.0), clause_rewrites[0]
    )

    compliance_detail = compliance.details if compliance else "High risk score detected."

    # ── Step 1: Draft negotiation email ──────────────────────────────────────
    groq_key = os.getenv("GROQ_API_KEY", "")
    use_groq = bool(groq_key) and Groq is not None
    client = Groq(api_key=groq_key) if use_groq else None

    if use_groq and client is not None and clause is not None:
        try:
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": _EMAIL_SYSTEM},
                    {
                        "role": "user",
                        "content": (
                            f"Write a negotiation email for this clause change:\n"
                            f"Original: {clause.text}\n"
                            f"Proposed: {ideal_rewrite.rewritten_text}\n"
                            f"Context: {compliance_detail}"
                        ),
                    },
                ],
                temperature=0.4,
                max_tokens=300,
            )
            email_draft = resp.choices[0].message.content or ""
        except Exception:
            email_draft = _draft_email(
                clause.text if clause else "", ideal_rewrite.rewritten_text, compliance_detail
            )
    else:
        email_draft = _draft_email(
            clause.text if clause else "", ideal_rewrite.rewritten_text, compliance_detail
        )

    # ── Step 2: Simulate counterparty response ───────────────────────────────
    sim_result: dict = {
        "outcome": "partial",
        "counter_proposal": ideal_rewrite.rewritten_text,
        "reasoning": "Counterparty accepts compromise terms.",
    }

    if use_groq and client is not None:
        try:
            sim_resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": _SIM_SYSTEM},
                    {
                        "role": "user",
                        "content": (
                            f"Original clause: {clause.text if clause else 'N/A'}\n"
                            f"MSME proposed: {ideal_rewrite.rewritten_text}\n"
                            f"Simulate counterparty response as JSON."
                        ),
                    },
                ],
                temperature=0.7,
                max_tokens=200,
                response_format={"type": "json_object"},
            )
            sim_result = json.loads(sim_resp.choices[0].message.content or "{}")
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "Counterparty simulation failed; using default outcome. Error: %s",
                exc,
                exc_info=True,
            )

    # ── Step 3: Re-score based on simulation outcome ──────────────────────────
    outcome = sim_result.get("outcome", "partial")
    # Map outcome to new rewrite text and expected score reduction
    if outcome == "accepted":
        final_text = ideal_rewrite.rewritten_text
        score_reduction = 3.5
    elif outcome == "partial":
        compromise = next(
            (r for r in clause_rewrites if r.risk_reduction == 2.0), ideal_rewrite
        )
        final_text = sim_result.get("counter_proposal") or compromise.rewritten_text
        score_reduction = 2.2
    else:  # rejected
        minimum = next(
            (r for r in clause_rewrites if r.risk_reduction == 1.0), ideal_rewrite
        )
        final_text = minimum.rewritten_text
        score_reduction = 1.0

    post_legal_base = max(0.0, target_score.legal_base - score_reduction)
    post_score = risk_score(
        post_legal_base,
        target_score.semantic_similarity,
        target_score.business_multiplier,
    )
    post_score = round(post_score, 2)

    post_risk_score = RiskScore(
        clause_id=f"{target_score.clause_id}-post-negotiation",
        legal_base=round(post_legal_base, 2),
        semantic_similarity=round(target_score.semantic_similarity, 2),
        business_multiplier=round(target_score.business_multiplier, 2),
        final_score=post_score,
        reasoning_trace=(
            f"Post-negotiation re-score. Counterparty {outcome}. "
            f"Original score: {target_score.final_score:.2f} → New score: {post_score:.2f}. "
            f"Agreed text: '{final_text[:80]}...'"
        ),
    )

    # ── Step 4: Final decision ────────────────────────────────────────────────
    if post_score < 5.0:
        final_decision = (
            f"SIGN — Risk reduced from {target_score.final_score:.1f} to {post_score:.1f} "
            f"after {outcome} negotiation. Proceed with revised clause."
        )
    elif post_score < 7.0:
        final_decision = (
            f"SIGN_WITH_CAUTION — Risk at {post_score:.1f} after {outcome}. "
            "Recommend legal review before signing."
        )
    else:
        final_decision = (
            f"DO_NOT_SIGN — Risk remains {post_score:.1f} after {outcome}. "
            "Clause is unacceptable. Escalate to legal counsel."
        )

    audit = AuditEvent(
        agent_name="autonomy_loop",
        action="negotiation_cycle_complete",
        input_snapshot={
            "original_score": target_score.final_score,
            "clause_id": target_score.clause_id,
            "outcome": outcome,
        },
        output_snapshot={
            "post_score": post_score,
            "final_decision": final_decision,
        },
        reasoning_trace=(
            f"Autonomy loop: drafted email, simulated counterparty ({outcome}), "
            f"re-scored {target_score.final_score:.2f} → {post_score:.2f}. "
            f"Decision: {final_decision}"
        ),
        timestamp=datetime.now(UTC),
    )

    return {
        "negotiation_email_draft": email_draft,
        "counterparty_simulation": sim_result,
        "risk_scores": [post_risk_score],
        "final_decision": final_decision,
        "audit_events": [audit],
        "execution_logs": [
            {
                "agent": "autonomy_loop",
                "action": "negotiation_cycle_complete",
                "original_score": target_score.final_score,
                "post_score": post_score,
                "outcome": outcome,
                "final_decision": final_decision,
            }
        ],
        "handoff_log": [
            f"Autonomy loop: {outcome} → score "
            f"{target_score.final_score:.2f}→{post_score:.2f} → {final_decision}"
        ],
    }

