"""A4 — Compliance Guard Agent.

Zero LLM calls.  Pure rule engine implementing MSME Act Section 15.
Extracts payment days from each clause via regex, checks against
the 45-day statutory limit, computes interest liability.

Per AGENTS.md:
  if payment_days > 45:
    excess = payment_days - 45
    interest = contract_value * (rbi_rate * 3 / 100) * (excess / 365)
    return STATUTORY_VIOLATION
"""

from __future__ import annotations

import os
import re
from datetime import UTC, datetime

from contractguard.models.audit import AuditEvent
from contractguard.models.clauses import ClauseInfo, ComplianceResult
from contractguard.models.state import ContractState

_DAY_RE = re.compile(r"(\d+)\s*day", re.I)


def _extract_payment_days(text: str) -> list[int]:
    """Return all integer day-values found in clause text."""
    return [int(m.group(1)) for m in _DAY_RE.finditer(text)]


async def compliance_guard(state: ContractState) -> dict:
    """Check every clause against MSME Act Section 15 (no LLM).

    Any payment term > 45 days triggers a statutory violation with
    calculated interest liability.
    """
    clauses: list[ClauseInfo] = state.get("clauses", [])
    profile = state.get("business_profile")

    contract_value: float = 0.0
    if profile is not None:
        contract_value = profile.contract_value

    rbi_rate = float(os.getenv("RBI_RATE", "6.5"))

    results: list[ComplianceResult] = []
    audit_events: list[AuditEvent] = []

    for clause in clauses:
        # MSME Act Section 15 applies ONLY to payment terms
        if clause.clause_type != "payment_terms":
            results.append(
                ComplianceResult(
                    clause_id=clause.clause_id,
                    violation=False,
                    statute="MSME Development Act 2006",
                    section="Section 15",
                    excess_days=0,
                    interest_liability=0.0,
                    details="Non-payment clause — MSME Act Section 15 not applicable.",
                )
            )
            continue

        # Prefer explicit payment_days, else regex extract
        days_list: list[int] = []
        if clause.payment_days is not None:
            days_list = [clause.payment_days]
        else:
            days_list = _extract_payment_days(clause.text)

        # Use only the MAXIMUM payment days found to avoid duplicate results
        if not days_list:
            # No payment days found — emit a clear result
            results.append(
                ComplianceResult(
                    clause_id=clause.clause_id,
                    violation=False,
                    statute="MSME Development Act 2006",
                    section="Section 15",
                    excess_days=0,
                    interest_liability=0.0,
                    details="No payment days specified — cannot assess MSME Act compliance.",
                )
            )
            audit_events.append(
                AuditEvent(
                    agent_name="A4_compliance_guard",
                    action="msme_act_no_payment_days",
                    input_snapshot={"clause_id": clause.clause_id},
                    output_snapshot={"violation": False, "reason": "no_payment_days"},
                    reasoning_trace="No payment days found in clause — skipping MSME check.",
                    timestamp=datetime.now(UTC),
                )
            )
            continue

        days = max(days_list)  # Use worst-case (largest) payment term

        if days > 45:
            excess = days - 45
            interest = (
                contract_value * (rbi_rate * 3 / 100) * (excess / 365)
            )
            interest = round(interest, 2)
            results.append(
                ComplianceResult(
                    clause_id=clause.clause_id,
                    violation=True,
                    statute="MSME Development Act 2006",
                    section="Section 15",
                    excess_days=excess,
                    interest_liability=interest,
                    details=(
                        f"Payment term of {days} days exceeds 45-day statutory limit "
                        f"by {excess} days. Interest liability: INR {interest:,.2f} "
                        f"(RBI rate {rbi_rate}%)."
                    ),
                )
            )
            audit_events.append(
                AuditEvent(
                    agent_name="A4_compliance_guard",
                    action="msme_act_violation",
                    input_snapshot={
                        "clause_id": clause.clause_id,
                        "payment_days": days,
                        "contract_value": contract_value,
                    },
                    output_snapshot={
                        "violation": True,
                        "excess_days": excess,
                        "interest_liability": interest,
                    },
                    reasoning_trace=(
                        f"Zero-LLM rule: payment_days={days} > 45 "
                        f"→ excess={excess}, interest={interest:.2f}."
                    ),
                    timestamp=datetime.now(UTC),
                )
            )
        else:
            results.append(
                ComplianceResult(
                    clause_id=clause.clause_id,
                    violation=False,
                    statute="MSME Development Act 2006",
                    section="Section 15",
                    excess_days=0,
                    interest_liability=0.0,
                    details=(
                        f"Payment term of {days} days is within the "
                        "45-day statutory limit. Compliant."
                    ),
                )
            )
            audit_events.append(
                AuditEvent(
                    agent_name="A4_compliance_guard",
                    action="msme_act_compliant",
                    input_snapshot={"clause_id": clause.clause_id, "payment_days": days},
                    output_snapshot={"violation": False},
                    reasoning_trace=f"payment_days={days} <= 45: compliant with MSME Act.",
                    timestamp=datetime.now(UTC),
                )
            )

    return {
        "compliance_results": results,
        "audit_events": audit_events,
        "estimated_loss": round(
            sum(r.interest_liability for r in results if r.violation) * 3.5, 2
        ),
        "estimated_savings": round(
            sum(r.interest_liability for r in results if r.violation) * 2.1, 2
        ),
        "impact_breakdown": {
            "interest_exposure_inr": round(
                sum(r.interest_liability for r in results if r.violation), 2
            ),
            "total_violations": sum(1 for r in results if r.violation),
            "assumptions": "estimated_loss = interest_exposure × 3.5; savings = exposure × 2.1",
        },
        "execution_logs": [
            {
                "agent": "A4_compliance_guard",
                "action": "compliance_check_complete",
                "clauses_checked": len(clauses),
                "violations": sum(1 for r in results if r.violation),
                "total_interest_liability": round(
                    sum(r.interest_liability for r in results), 2
                ),
            }
        ],
        "handoff_log": [
            "A4 → A5/A6/A7: compliance checks complete, "
            f"violations={sum(1 for r in results if r.violation)}"
        ],
    }
