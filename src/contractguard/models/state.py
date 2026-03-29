"""ContractState — LangGraph shared state using TypedDict with Annotated reducers."""

from __future__ import annotations

import operator
from typing import Annotated, Any

from typing_extensions import TypedDict

from contractguard.models.audit import AuditEvent
from contractguard.models.business import BusinessProfile
from contractguard.models.clauses import (
    Alert,
    ClauseInfo,
    ComplianceResult,
    NegotiationRewrite,
    RiskScore,
)


def merge_dicts(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    """Merge two dicts with rhs overwriting conflicting keys."""
    return {**a, **b}


class ContractState(TypedDict, total=False):
    """Shared state flowing through the LangGraph pipeline.

    Fields using ``Annotated[list, operator.add]`` are merge-friendly:
    parallel nodes can each append items and the reducer concatenates them.
    """

    # -- Input --
    raw_document: bytes | None
    document_path: str
    document_filename: str

    # -- A1: Document Intelligence --
    ocr_text: str
    ocr_confidence: float
    clauses: list[ClauseInfo]

    # -- A2: Business Profiler --
    business_profile: BusinessProfile | None

    # -- A3: Risk Scorer (parallel-safe via reducer) --
    risk_scores: Annotated[list[RiskScore], operator.add]

    # -- A4: Compliance Guard (parallel-safe via reducer) --
    compliance_results: Annotated[list[ComplianceResult], operator.add]

    # -- Business impact estimates (from A4) --
    estimated_loss: float
    estimated_savings: float
    impact_breakdown: dict[str, Any]

    # -- A5: Negotiation Agent --
    negotiation_rewrites: list[NegotiationRewrite]

    # -- A6: Audit Trail (parallel-safe via reducer) --
    audit_events: Annotated[list[AuditEvent], operator.add]

    # -- Agent-to-agent narrative log (parallel-safe via reducer) --
    handoff_log: Annotated[list[str], operator.add]

    # -- A7: Lifecycle Monitor --
    alerts: list[Alert]

    # -- Gate flags --
    gate_flags: Annotated[dict[str, Any], merge_dicts]

    # -- Metadata --
    analysis_id: str
    error: str | None

    # -- A2: sector weight published for A3 to consume --
    sector_risk_weight: float

    # -- Autonomy loop outputs (added after Stage 3) --
    negotiation_email_draft: str
    counterparty_simulation: dict[str, Any]
    final_decision: str

    # -- Execution logs (parallel-safe, all agents append) --
    execution_logs: Annotated[list[dict[str, Any]], operator.add]

    # -- Gate: pipeline paused waiting for input --
    pause_reason: str
