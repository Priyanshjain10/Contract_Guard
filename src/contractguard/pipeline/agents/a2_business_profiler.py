"""A2 — Business Profiler Agent.

If state["business_profile"] is already set: compute sector_risk_weight
using SECTOR_WEIGHTS and return.
If not set: set state["needs_profile"]=True and return.

Appends AuditEvent for every run.  Zero LLM calls — pure lookup.
"""

from __future__ import annotations

from datetime import UTC, datetime

from contractguard.models.audit import AuditEvent
from contractguard.models.state import ContractState

SECTOR_WEIGHTS: dict[str, float] = {
    "textiles": 1.5,
    "manufacturing": 1.2,
    "trading": 1.3,
    "IT": 0.8,
    "services": 0.9,
}


async def business_profiler(state: ContractState) -> dict:
    """Resolve business context and attach sector_risk_weight."""
    profile = state.get("business_profile")
    audit_events: list[AuditEvent] = []
    gate_flags: dict = dict(state.get("gate_flags", {}))

    if profile is None:
        # No profile provided — flag for UI to prompt user
        gate_flags["needs_profile"] = True
        audit_events.append(
            AuditEvent(
                agent_name="A2_business_profiler",
                action="profile_missing",
                input_snapshot={
                    "business_profile": None,
                },
                output_snapshot={
                    "needs_profile": True,
                },
                reasoning_trace=(
                    "No business_profile in state. "
                    "Setting needs_profile=True so the UI "
                    "can prompt the user."
                ),
                timestamp=datetime.now(UTC),
            )
        )
        return {
            "gate_flags": gate_flags,
            "audit_events": audit_events,
            "pause_reason": (
                "Business profile required — please provide sector, margin, "
                "payment cycle, revenue, and contract value."
            ),
            "execution_logs": [
                {
                    "agent": "A2_business_profiler",
                    "action": "profile_missing",
                    "needs_profile": True,
                }
            ],
            "handoff_log": [
                "A2 → A3/A4: business profile missing, pipeline paused"
            ],
        }

    # Profile exists — compute sector_risk_weight
    sector = profile.sector
    weight = SECTOR_WEIGHTS.get(sector, 1.0)

    audit_events.append(
        AuditEvent(
            agent_name="A2_business_profiler",
            action="compute_sector_weight",
            input_snapshot={
                "sector": sector,
                "gross_margin_pct": profile.gross_margin_pct,
                "payment_cycle_days": profile.payment_cycle_days,
                "monthly_revenue": profile.monthly_revenue,
                "contract_value": profile.contract_value,
            },
            output_snapshot={
                "sector_risk_weight": weight,
            },
            reasoning_trace=(
                f"Sector '{sector}' maps to weight {weight} "
                f"from SECTOR_WEIGHTS lookup. "
                f"No LLM call — pure dictionary lookup."
            ),
            timestamp=datetime.now(UTC),
        )
    )

    return {
        "sector_risk_weight": weight,
        "audit_events": audit_events,
        "execution_logs": [
            {
                "agent": "A2_business_profiler",
                "action": "compute_sector_weight",
                "sector": sector,
                "sector_risk_weight": weight,
                "gross_margin_pct": profile.gross_margin_pct,
            }
        ],
        "handoff_log": [
            f"A2 → A3/A4: profile loaded for sector={sector}, sector_weight={weight:.2f}"
        ],
    }
