"""LangGraph StateGraph — 7-node pipeline with parallel fork/join and gates.

Execution topology (from AGENTS.md):
    [START] ──┬──> A1 (doc_intelligence)
              └──> A2 (business_profiler)
                       │
                  join_phase_1
                       │
              ┌────────┴────────┐
              A3                A4
         (risk_scorer)    (compliance_guard)
              └────────┬────────┘
                  join_phase_2
                       │
         ┌─────────────┼─────────────┐
         A5            A6            A7
    (negotiation)  (audit_trail)  (lifecycle)
         └─────────────┼─────────────┘
                  join_phase_3
                       │
                     [END]

Gates:
    GATE1: OCR confidence < 0.8 → flag for review
    GATE2: Any risk score > 8.0 → flag for review
    GATE3: Final user review (always flagged, checked externally)
"""

from __future__ import annotations

from datetime import UTC, datetime

from langgraph.graph import END, START, StateGraph

from contractguard.models.audit import AuditEvent
from contractguard.models.state import ContractState
from contractguard.pipeline.agents.a1_doc_intelligence import doc_intelligence
from contractguard.pipeline.agents.a2_business_profiler import business_profiler
from contractguard.pipeline.agents.a3_risk_scorer import risk_scorer
from contractguard.pipeline.agents.a4_compliance_guard import compliance_guard
from contractguard.pipeline.agents.a5_negotiation_agent import negotiation_agent
from contractguard.pipeline.agents.a6_audit_trail import audit_trail
from contractguard.pipeline.agents.a7_lifecycle_monitor import lifecycle_monitor
from contractguard.pipeline.agents.autonomy_loop import autonomy_loop

# ---------------------------------------------------------------------------
# Join nodes — merge parallel branches and evaluate gates
# ---------------------------------------------------------------------------


async def join_phase_1(state: ContractState) -> dict:
    """Join after A1 ‖ A2.  Evaluate GATE1 (OCR confidence)."""
    ocr_confidence = state.get("ocr_confidence", 1.0)
    gate_flags = dict(state.get("gate_flags", {}))

    if ocr_confidence < 0.8:
        gate_flags["GATE1_low_ocr"] = True
    else:
        gate_flags["GATE1_low_ocr"] = False

    return {"gate_flags": gate_flags}


async def join_phase_2(state: ContractState) -> dict:
    """Join after A3 ‖ A4.  Evaluate GATE2 (high risk score)."""
    risk_scores = state.get("risk_scores", [])
    compliance_results = state.get("compliance_results", [])
    gate_flags = dict(state.get("gate_flags", {}))

    has_critical = any(s.final_score >= 8.0 for s in risk_scores) or any(
        c.violation for c in compliance_results
    )
    gate_flags["GATE2_critical_risk"] = has_critical

    return {
        "gate_flags": gate_flags,
        "handoff_log": [
            "GATE2 (> 8.0): "
            f"{'TRIGGERED' if has_critical else 'CLEAR'} after A3/A4 aggregation"
        ],
    }


async def join_phase_3(state: ContractState) -> dict:
    """Join after Stage 3 nodes (A5 ‖ A6 ‖ A7 and optional escalation)."""
    gate_flags = dict(state.get("gate_flags", {}))
    gate_flags["GATE3_user_review"] = True  # Always flag for user review
    return {"gate_flags": gate_flags}


# ---------------------------------------------------------------------------
# Routing functions for conditional edges
# ---------------------------------------------------------------------------


def route_after_gate1(state: ContractState) -> list[str]:
    """After GATE1: route based on OCR quality and profile availability."""
    gate_flags = state.get("gate_flags", {})
    if gate_flags.get("GATE1_low_ocr") is True:
        return ["human_review_ocr"]
    if gate_flags.get("needs_profile") is True:
        return ["await_business_profile"]
    return ["risk_scorer", "compliance_guard"]


def route_after_gate2(state: ContractState) -> list[str]:
    """After GATE2: include escalation branch if any critical risk is present."""
    if state.get("gate_flags", {}).get("GATE2_critical_risk") is True:
        return [
            "negotiation_agent",
            "audit_trail",
            "lifecycle_monitor",
            "critical_risk_escalation",
        ]
    return ["negotiation_agent", "audit_trail", "lifecycle_monitor"]


async def human_review_ocr(state: ContractState) -> dict:
    """Terminal node when OCR confidence is too low for autonomous analysis."""
    return {
        "error": "OCR confidence below threshold — document requires manual review",
    }


async def await_business_profile(state: ContractState) -> dict:
    """Terminal node when business profile is missing."""
    return {
        "pause_reason": (
            "Business profile required. Provide: sector, gross_margin_pct, "
            "payment_cycle_days, monthly_revenue, contract_value."
        ),
        "error": "Pipeline paused: missing business_profile",
    }


async def critical_risk_escalation(state: ContractState) -> dict:
    """Append an escalation audit event with all clause scores above 8.0."""
    critical_scores = [
        {"clause_id": score.clause_id, "score": round(score.final_score, 2)}
        for score in state.get("risk_scores", [])
        if score.final_score >= 8.0
    ]
    if not critical_scores:
        return {"audit_events": []}

    reasoning = "Escalated critical risk clauses: " + ", ".join(
        f"{item['clause_id']}={item['score']}" for item in critical_scores
    )
    event = AuditEvent(
        agent_name="GATE2_escalation",
        action="critical_risk_escalated",
        input_snapshot={"critical_threshold": 8.0},
        output_snapshot={"critical_scores": critical_scores},
        reasoning_trace=reasoning,
        timestamp=datetime.now(UTC),
    )
    return {"audit_events": [event]}


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------


def build_graph() -> StateGraph:
    """Construct and return the compiled LangGraph pipeline.

    Returns:
        Compiled StateGraph ready for invocation.
    """
    graph = StateGraph(ContractState)

    # -- Add nodes --
    graph.add_node("doc_intelligence", doc_intelligence)
    graph.add_node("business_profiler", business_profiler)
    graph.add_node("join_phase_1", join_phase_1)
    graph.add_node("human_review_ocr", human_review_ocr)
    graph.add_node("await_business_profile", await_business_profile)
    graph.add_node("risk_scorer", risk_scorer)
    graph.add_node("compliance_guard", compliance_guard)
    graph.add_node("join_phase_2", join_phase_2)
    graph.add_node("negotiation_agent", negotiation_agent)
    graph.add_node("audit_trail", audit_trail)
    graph.add_node("lifecycle_monitor", lifecycle_monitor)
    graph.add_node("critical_risk_escalation", critical_risk_escalation)
    graph.add_node("join_phase_3", join_phase_3)
    graph.add_node("autonomy_loop", autonomy_loop)

    # -- Phase 1: START → [A1 ‖ A2] → join_phase_1 --
    graph.add_edge(START, "doc_intelligence")
    graph.add_edge(START, "business_profiler")
    graph.add_edge("doc_intelligence", "join_phase_1")
    graph.add_edge("business_profiler", "join_phase_1")

    # -- Phase 2: join_phase_1 → [A3 ‖ A4] → join_phase_2 --
    graph.add_conditional_edges("join_phase_1", route_after_gate1)
    graph.add_edge("human_review_ocr", END)
    graph.add_edge("await_business_profile", END)
    graph.add_edge("risk_scorer", "join_phase_2")
    graph.add_edge("compliance_guard", "join_phase_2")

    # -- Phase 3: join_phase_2 → [A5 ‖ A6 ‖ A7] → join_phase_3 --
    graph.add_conditional_edges("join_phase_2", route_after_gate2)
    graph.add_edge("negotiation_agent", "join_phase_3")
    graph.add_edge("audit_trail", "join_phase_3")
    graph.add_edge("lifecycle_monitor", "join_phase_3")
    graph.add_edge("critical_risk_escalation", "join_phase_3")

    # -- End --
    graph.add_edge("join_phase_3", "autonomy_loop")
    graph.add_edge("autonomy_loop", END)

    return graph.compile()


# Module-level compiled graph instance
pipeline = build_graph()
