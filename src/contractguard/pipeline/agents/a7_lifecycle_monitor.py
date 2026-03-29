"""A7 — Lifecycle Monitor Agent.

Monitors contract clauses for payment deadlines, extracts payment days via
regex, checks MSME Act Section 15 (>45 days triggers interest), sends a
WhatsApp alert via Twilio when TWILIO_ACCOUNT_SID is set, otherwise logs the
alert dict to state audit_events.  All paths append an AuditEvent.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import UTC, datetime

from contractguard.models.audit import AuditEvent
from contractguard.models.clauses import Alert, ClauseInfo
from contractguard.models.state import ContractState

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regex: match the first integer followed by optional whitespace + "day"
# e.g. "Net-90 days", "within 30-day period", "payment in 45 days"
# ---------------------------------------------------------------------------
_DAY_RE = re.compile(r"(\d+)\s*day", re.IGNORECASE)

# Statutory ceiling under MSME Development Act 2006, Section 15
_MSME_LIMIT_DAYS: int = 45


def _extract_payment_days(text: str) -> int | None:
    """Return the first day-count found in *text*, or None."""
    m = _DAY_RE.search(text)
    return int(m.group(1)) if m else None


def _compute_interest(contract_value: float, excess_days: int) -> float:
    """Compute compound interest per MSME Act formula.

    interest = contract_value × (rbi_rate × 3 / 100) × (excess / 365)
    RBI_RATE defaults to 6.5 % if the environment variable is absent.
    """
    rbi_rate = float(os.getenv("RBI_RATE", "6.5"))
    return contract_value * (rbi_rate * 3 / 100) * (excess_days / 365)


async def _send_whatsapp(alert_dict: dict) -> None:
    """Dispatch a WhatsApp message via Twilio (only if credentials present)."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
    to_number = os.getenv("TWILIO_WHATSAPP_TO", "")

    if not (account_sid and auth_token and to_number):
        raise RuntimeError("Twilio credentials incomplete — cannot send WhatsApp.")

    # Import lazily so the module loads without twilio installed in test envs.
    from twilio.rest import Client  # type: ignore[import-untyped]

    body = (
        f"[ContractGuard] MSME Act Alert\n"
        f"Clause: {alert_dict.get('clause_id')}\n"
        f"Excess days: {alert_dict.get('excess_days', 'N/A')}\n"
        f"Interest liability: ₹{alert_dict.get('interest_liability', 0):.2f}\n"
        f"Statute: MSME Development Act 2006, Section 15"
    )
    client = Client(account_sid, auth_token)
    # Twilio's create() is synchronous; wrap with run_in_executor for async safety.
    import asyncio

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: client.messages.create(body=body, from_=from_number, to=to_number),
    )
    logger.info("WhatsApp alert sent for clause %s", alert_dict.get("clause_id"))


def _build_alert_dict(clause: ClauseInfo, days: int, excess: int, interest: float) -> dict:
    return {
        "clause_id": clause.clause_id,
        "clause_type": clause.clause_type,
        "payment_days": days,
        "excess_days": excess,
        "interest": round(interest, 2),
        "statute": "MSME Development Act 2006",
        "section": "Section 15",
        "timestamp": datetime.now(UTC).isoformat(),
    }


async def lifecycle_monitor(state: ContractState) -> dict:
    """Send lifecycle alerts based on A4 compliance results and clause deadlines.

    Responsibilities:
    - Alert on MSME Act violations (sourced from A4, no recalculation)
    - Alert on renewal/termination deadlines found in clauses
    - Send via Twilio WhatsApp if credentials present; else log to audit trail
    """
    clauses: list[ClauseInfo] = state.get("clauses", [])
    compliance_results = state.get("compliance_results", [])

    bp = state.get("business_profile")
    contract_value: float = float(getattr(bp, "contract_value", 0) or 0) if bp else 0.0

    alerts: list[Alert] = []
    extra_audit_events: list[AuditEvent] = []

    # ── Alert on MSME violations from A4 (no recalculation) ─────────────────
    for cr in compliance_results:
        if not cr.violation:
            continue

        alert_dict = {
            "clause_id": cr.clause_id,
            "violation_type": "MSME_Act_Section_15",
            "excess_days": cr.excess_days,
            "interest_liability": cr.interest_liability,
            "statute": cr.statute,
            "details": cr.details,
        }
        alerts.append(
            Alert(
                alert_type="compliance",
                message=(
                    f"MSME Act §15 violation on clause {cr.clause_id}: "
                    f"{cr.excess_days} excess days, ₹{cr.interest_liability:,.0f} interest"
                ),
                clause_id=cr.clause_id,
                channel="whatsapp",
            )
        )

        twilio_ok = bool(os.getenv("TWILIO_ACCOUNT_SID"))
        if twilio_ok:
            try:
                await _send_whatsapp(alert_dict)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Twilio dispatch failed: %s", exc)
                twilio_ok = False

        if not twilio_ok:
            extra_audit_events.append(
                AuditEvent(
                    agent_name="A7_lifecycle_monitor",
                    action="msme_alert_logged",
                    input_snapshot={"clause_id": cr.clause_id},
                    output_snapshot=alert_dict,
                    reasoning_trace=(
                        f"MSME Act violation from A4: {cr.details}. "
                        "Twilio unavailable — alert stored in audit trail."
                    ),
                    timestamp=datetime.now(UTC),
                )
            )

    # ── Alert on renewal/termination clauses ─────────────────────────────────
    deadline_kw = ("terminat", "renew", "expir", "notice period")
    for clause in clauses:
        lower = clause.text.lower()
        if any(kw in lower for kw in deadline_kw):
            alerts.append(
                Alert(
                    alert_type="renewal",
                    message=f"Renewal/termination clause detected: {clause.clause_id}",
                    clause_id=clause.clause_id,
                    channel="whatsapp",
                )
            )

    primary_audit = AuditEvent(
        agent_name="A7_lifecycle_monitor",
        action="schedule_alerts",
        input_snapshot={
            "compliance_violations": len(
                [c for c in compliance_results if c.violation]
            ),
            "clauses": len(clauses),
            "contract_value": contract_value,
        },
        output_snapshot={"alerts_scheduled": len(alerts)},
        reasoning_trace=(
            f"Raised {len(alerts)} alerts from A4 violations and renewal clauses. "
            "No duplicate MSME interest calculation — sourced from A4."
        ),
        timestamp=datetime.now(UTC),
    )

    return {
        "alerts": alerts,
        "audit_events": [primary_audit, *extra_audit_events],
        "execution_logs": [
            {
                "agent": "A7_lifecycle_monitor",
                "action": "alerts_dispatched",
                "compliance_alerts": len(
                    [a for a in alerts if a.alert_type == "compliance"]
                ),
                "renewal_alerts": len(
                    [a for a in alerts if a.alert_type == "renewal"]
                ),
            }
        ],
        "handoff_log": [
            "A7 → user: lifecycle monitoring complete, "
            f"alerts={len(alerts)}"
        ],
    }
