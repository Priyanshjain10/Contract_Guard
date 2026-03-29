"""Tests for the LangGraph pipeline and FastAPI endpoints."""

import pytest

from contractguard.models.business import BusinessProfile
from contractguard.models.clauses import ClauseInfo, RiskScore
from contractguard.pipeline.agents.a3_risk_scorer import _semantic_sim
from contractguard.pipeline.agents.a7_lifecycle_monitor import lifecycle_monitor
from contractguard.pipeline.graph import (
    build_graph,
    critical_risk_escalation,
    human_review_ocr,
    route_after_gate1,
    route_after_gate2,
)


@pytest.mark.asyncio
async def test_pipeline_compiles_and_runs():
    """Pipeline compiles and runs end-to-end with stub agents."""
    compiled = build_graph()
    assert compiled is not None

    initial_state = {
        "analysis_id": "TEST-001",
        "document_filename": "test.pdf",
        "business_profile": BusinessProfile(
            sector="textiles",
            gross_margin_pct=8.0,
            payment_cycle_days=15,
            monthly_revenue=500_000.0,
            contract_value=2_000_000.0,
        ),
        "risk_scores": [],
        "compliance_results": [],
        "audit_events": [],
    }

    result = await compiled.ainvoke(initial_state)

    # Verify all pipeline outputs are present
    assert len(result["clauses"]) > 0, "A1 should extract clauses"
    assert result["business_profile"] is not None, "A2 should set profile"
    assert len(result["risk_scores"]) > 0, "A3 should produce risk scores"
    assert len(result["compliance_results"]) > 0, "A4 should produce compliance results"
    assert len(result["audit_events"]) > 0, "A6 should accumulate audit events"
    assert "gate_flags" in result, "Gates should set flags"


@pytest.mark.asyncio
async def test_pipeline_textile_net90_detects_violation():
    """Net-90 with textile MSME should flag MSME Act violation."""
    compiled = build_graph()

    initial_state = {
        "analysis_id": "TEST-002",
        "document_filename": "net90.pdf",
        "business_profile": BusinessProfile(
            sector="textiles",
            gross_margin_pct=8.0,
            payment_cycle_days=15,
            monthly_revenue=500_000.0,
            contract_value=2_000_000.0,
        ),
        "risk_scores": [],
        "compliance_results": [],
        "audit_events": [],
    }

    result = await compiled.ainvoke(initial_state)

    violations = [r for r in result["compliance_results"] if r.violation]
    assert len(violations) > 0, "Net-90 should trigger MSME Act violation"
    assert violations[0].statute == "MSME Development Act 2006"
    assert violations[0].section == "Section 15"


@pytest.mark.asyncio
async def test_pipeline_high_risk_triggers_gate2():
    """Pre-seeded critical risk score should set GATE2 flag via join_phase_2."""
    from contractguard.models.clauses import RiskScore
    compiled = build_graph()

    initial_state = {
        "analysis_id": "TEST-003",
        "document_filename": "risky.pdf",
        "business_profile": BusinessProfile(
            sector="textiles",
            gross_margin_pct=8.0,
            payment_cycle_days=15,
            monthly_revenue=500_000.0,
            contract_value=2_000_000.0,
        ),
        "risk_scores": [
            RiskScore(
                clause_id="CL-PRESET",
                legal_base=9.0,
                semantic_similarity=9.0,
                business_multiplier=9.0,
                final_score=9.0,
                reasoning_trace="preset critical score for gate test",
            )
        ],
        "compliance_results": [],
        "audit_events": [],
    }

    result = await compiled.ainvoke(initial_state)

    gate_flags = result.get("gate_flags", {})
    assert "GATE2_critical_risk" in gate_flags
    assert gate_flags["GATE2_critical_risk"] is True
    assert gate_flags["GATE2_critical_risk"] is True


@pytest.mark.asyncio
async def test_pipeline_gate1_low_ocr_routes_to_human_review():
    """route_after_gate1 should return human review path when low OCR is flagged."""
    routes = route_after_gate1({"gate_flags": {"GATE1_low_ocr": True}})
    assert routes == ["human_review_ocr"]
    node_result = await human_review_ocr({})
    assert (
        node_result["error"]
        == "OCR confidence below threshold — document requires manual review"
    )


@pytest.mark.asyncio
async def test_pipeline_gate2_escalation_adds_audit_event():
    """Escalation node should emit audit event with critical clause details."""
    result = await critical_risk_escalation(
        {
            "risk_scores": [
                RiskScore(
                    clause_id="CL-123",
                    legal_base=9.0,
                    semantic_similarity=9.0,
                    business_multiplier=9.0,
                    final_score=9.1,
                    reasoning_trace="critical",
                )
            ]
        }
    )
    escalation_events = result.get("audit_events", [])
    assert escalation_events
    assert escalation_events[0].agent_name == "GATE2_escalation"
    assert escalation_events[0].action == "critical_risk_escalated"
    assert escalation_events[0].input_snapshot["critical_threshold"] == 8.0


def test_route_after_gate2_branching():
    """route_after_gate2 should include escalation only when gate 2 is triggered."""
    with_escalation = route_after_gate2({"gate_flags": {"GATE2_critical_risk": True}})
    without_escalation = route_after_gate2({"gate_flags": {"GATE2_critical_risk": False}})
    assert "critical_risk_escalation" in with_escalation
    assert "critical_risk_escalation" not in without_escalation


@pytest.mark.asyncio
async def test_pipeline_collects_agent_handoff_log():
    """Pipeline should expose handoff narrative emitted by agents."""
    compiled = build_graph()
    result = await compiled.ainvoke(
        {
            "analysis_id": "TEST-HANDOFF",
            "document_filename": "handoff.pdf",
            "business_profile": BusinessProfile(
                sector="textiles",
                gross_margin_pct=8.0,
                payment_cycle_days=15,
                monthly_revenue=500_000.0,
                contract_value=2_000_000.0,
            ),
            "risk_scores": [],
            "compliance_results": [],
            "audit_events": [],
            "handoff_log": [],
        }
    )
    logs = result.get("handoff_log", [])
    assert logs
    assert any(line.startswith("A1 → A2/A3: extracted") for line in logs)
    assert any("GATE2 (> 8.0)" in line for line in logs)


@pytest.mark.asyncio
async def test_lifecycle_monitor_uses_contract_value_not_monthly_revenue():
    """A7 interest calculations should be based on business_profile.contract_value."""
    result = await lifecycle_monitor(
        {
            "business_profile": BusinessProfile(
                sector="textiles",
                gross_margin_pct=8.0,
                payment_cycle_days=15,
                monthly_revenue=10_000_000.0,
                contract_value=2_000_000.0,
            ),
            "clauses": [
                ClauseInfo(
                    clause_id="CL-TEST",
                    clause_type="payment_terms",
                    text="Payment within 90 days from invoice date",
                    payment_days=90,
                    confidence=0.9,
                )
            ],
        }
    )
    primary = result["audit_events"][0]
    assert primary.input_snapshot["contract_value"] == 2_000_000.0


@pytest.mark.asyncio
async def test_autonomy_loop_produces_final_decision():
    """Full pipeline should return a final_decision after autonomy loop."""
    compiled = build_graph()
    result = await compiled.ainvoke({
        "analysis_id": "TEST-AUTONOMY",
        "document_filename": "autonomy.txt",
        "ocr_text": (
            "1. PAYMENT TERMS\n"
            "Payment shall be made within 90 days of invoice date.\n\n"
            "2. LIABILITY\n"
            "Supplier bears unlimited liability for all defects.\n\n"
            "3. TERMINATION\n"
            "Client may terminate with 7 days notice.\n"
        ),
        "business_profile": BusinessProfile(
            sector="textiles",
            gross_margin_pct=8.0,
            payment_cycle_days=15,
            monthly_revenue=500_000.0,
            contract_value=2_000_000.0,
        ),
        "risk_scores": [],
        "compliance_results": [],
        "audit_events": [],
        "handoff_log": [],
    })
    assert result.get("final_decision"), "final_decision must be set"
    assert result.get("negotiation_email_draft"), "email_draft must be set"
    assert result.get("counterparty_simulation"), "simulation must be set"
    # Post-negotiation score should exist
    post_scores = [s for s in result.get("risk_scores", []) if "post-negotiation" in s.clause_id]
    assert len(post_scores) >= 1, "Autonomy loop must produce at least one post-negotiation score"


@pytest.mark.asyncio
async def test_pipeline_pause_on_missing_profile():
    """Pipeline should pause and set pause_reason when no business profile given."""
    from contractguard.pipeline.graph import build_graph
    compiled = build_graph()
    result = await compiled.ainvoke({
        "analysis_id": "TEST-NO-PROFILE",
        "ocr_text": "Payment within 90 days of invoice date.",
        "risk_scores": [],
        "compliance_results": [],
        "audit_events": [],
        "handoff_log": [],
    })
    assert result.get("pause_reason"), "pause_reason must be set when no profile"


@pytest.mark.asyncio
async def test_a4_returns_one_result_per_clause():
    """A4 must return exactly one ComplianceResult per clause."""
    from contractguard.pipeline.agents.a4_compliance_guard import compliance_guard
    result = await compliance_guard({
        "clauses": [
            ClauseInfo(clause_id="CL-V", clause_type="payment_terms", text="Payment within 90 days.", payment_days=90, confidence=0.9),
            ClauseInfo(clause_id="CL-C", clause_type="payment_terms", text="Payment within 30 days.", payment_days=30, confidence=0.9),
            ClauseInfo(clause_id="CL-N", clause_type="general", text="Supplier bears all liability.", payment_days=None, confidence=0.9),
        ],
        "business_profile": BusinessProfile(
            sector="textiles", gross_margin_pct=8.0, payment_cycle_days=15,
            monthly_revenue=500_000.0, contract_value=2_000_000.0
        ),
    })
    assert len(result["compliance_results"]) == 3, "Must have exactly one result per clause"
    violations = [r for r in result["compliance_results"] if r.violation]
    assert len(violations) == 1


@pytest.mark.asyncio
async def test_a2_publishes_sector_risk_weight():
    """A2 must write sector_risk_weight to its return dict."""
    from contractguard.pipeline.agents.a2_business_profiler import business_profiler
    result = await business_profiler({
        "business_profile": BusinessProfile(
            sector="textiles", gross_margin_pct=8.0, payment_cycle_days=15,
            monthly_revenue=500_000.0, contract_value=2_000_000.0
        )
    })
    assert "sector_risk_weight" in result
    assert result["sector_risk_weight"] == 1.5


def test_semantic_sim_clamps_below_zero_similarity():
    """A3 semantic similarity should clamp below-zero similarity to 0.0."""
    class _StubCollection:
        def query(self, *, query_texts, n_results):
            del query_texts, n_results
            return {"distances": [[1.51]]}

    assert _semantic_sim("payment within 90 days", _StubCollection()) == 0.0


def test_semantic_sim_clamps_above_one_similarity_values():
    """A3 semantic similarity should clamp above-one similarity to 10.0."""
    class _StubCollection:
        def query(self, *, query_texts, n_results):
            del query_texts, n_results
            return {"distances": [[-0.2]]}

    assert _semantic_sim("payment within 90 days", _StubCollection()) == 10.0
