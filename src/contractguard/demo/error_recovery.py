"""
Demo script: shows ContractGuard handling 3 error scenarios live.
Run: python -m contractguard.demo.error_recovery
"""

from __future__ import annotations

import asyncio

from contractguard.models.business import BusinessProfile
from contractguard.models.clauses import RiskScore
from contractguard.pipeline.graph import pipeline


def _print_result(label: str, passed: bool, message: str) -> None:
    status = "PASS" if passed else "FAIL"
    print(f"{label} {status} — {message}")


async def _scenario_low_ocr_confidence() -> None:
    initial_state = {
        "analysis_id": "DEMO-SCENARIO-1",
        "ocr_text": "",
        "ocr_confidence": 0.3,
        "gate_flags": {"GATE1_low_ocr": True},
        "risk_scores": [],
        "compliance_results": [],
        "audit_events": [],
    }
    result = await pipeline.ainvoke(initial_state)
    passed = result.get("error") is not None
    print(
        f"SCENARIO 1 RESULT: Pipeline halted at GATE1 — error: {result.get('error')}"
    )
    _print_result(
        "SCENARIO 1",
        passed,
        f"GATE1_low_ocr={result.get('gate_flags', {}).get('GATE1_low_ocr')}",
    )


async def _scenario_critical_risk_score() -> None:
    initial_state = {
        "analysis_id": "DEMO-SCENARIO-2",
        "document_filename": "net90.txt",
        "ocr_text": "Payment shall be made within 90 days of invoice date.",
        "business_profile": BusinessProfile(
            sector="textiles",
            gross_margin_pct=8.0,
            payment_cycle_days=15,
            monthly_revenue=500000.0,
            contract_value=2_000_000.0,
        ),
        "risk_scores": [
            RiskScore(
                clause_id="CL-PRESET",
                legal_base=9.4,
                semantic_similarity=9.2,
                business_multiplier=9.6,
                final_score=9.3,
                reasoning_trace="Preset deterministic critical score for escalation demo.",
            )
        ],
        "compliance_results": [],
        "audit_events": [],
    }
    result = await pipeline.ainvoke(initial_state)
    events = [
        e for e in result.get("audit_events", []) if e.agent_name == "GATE2_escalation"
    ]
    print("SCENARIO 2 RESULT: Critical-risk escalation audit events")
    for event in events:
        print(
            f"- {event.agent_name}: {event.action} | {event.reasoning_trace}"
        )
    _print_result(
        "SCENARIO 2",
        bool(events),
        f"GATE2_critical_risk={result.get('gate_flags', {}).get('GATE2_critical_risk')}",
    )


async def _scenario_missing_business_profile() -> None:
    initial_state = {
        "analysis_id": "DEMO-SCENARIO-3",
        "document_filename": "contract.txt",
        "ocr_text": "Payment shall be made within 30 days from invoice date.",
        "risk_scores": [],
        "compliance_results": [],
        "audit_events": [],
    }
    result = await pipeline.ainvoke(initial_state)
    needs_profile = result.get("gate_flags", {}).get("needs_profile") is True
    print("SCENARIO 3 RESULT: Pipeline flagged missing profile — UI must prompt user")
    _print_result("SCENARIO 3", needs_profile, "needs_profile=True")


async def main() -> None:
    await _scenario_low_ocr_confidence()
    await _scenario_critical_risk_score()
    await _scenario_missing_business_profile()


if __name__ == "__main__":
    asyncio.run(main())
