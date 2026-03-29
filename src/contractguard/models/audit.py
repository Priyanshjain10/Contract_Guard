"""AuditEvent model — immutable record for Agent A6 audit trail."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AuditEvent(BaseModel):
    """Immutable audit record written before+after every agent execution.

    Per AGENTS.md: Every LLM call → write AuditEvent with reasoning_trace.
    reasoning_trace must contain real LLM chain-of-thought, never a fake summary.
    """

    model_config = ConfigDict(strict=True)

    agent_name: str = Field(..., description="Agent that produced the event, e.g. 'A3_risk_scorer'")
    action: str = Field(..., description="Action taken, e.g. 'score_clause', 'check_compliance'")
    input_snapshot: dict[str, Any] = Field(
        default_factory=dict, description="Relevant input state before agent ran"
    )
    output_snapshot: dict[str, Any] = Field(
        default_factory=dict, description="Relevant output state after agent ran"
    )
    reasoning_trace: str = Field(
        "", description="Real LLM chain-of-thought (never fabricated)"
    )
    error: str | None = Field(None, description="Error message if the agent failed")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="UTC timestamp of the event",
    )
