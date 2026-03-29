"""Clause-related models: ClauseInfo, RiskScore, ComplianceResult, NegotiationRewrite, Alert."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ClauseInfo(BaseModel):
    """A single contract clause extracted by Agent A1."""

    model_config = ConfigDict(strict=True)

    clause_id: str = Field(..., description="Unique identifier for the clause")
    clause_type: str = Field(..., description="Category, e.g. 'payment_terms', 'liability'")
    text: str = Field(..., description="Raw clause text")
    payment_days: int | None = Field(None, ge=0, description="Payment days if applicable")
    confidence: float = Field(1.0, ge=0.0, le=1.0, description="Extraction confidence")
    is_ambiguous: bool = Field(
        False,
        description=(
            "True when clause is a payment clause but no specific day count could be extracted "
            "(e.g. 'within a reasonable time'). Signals that scoring may be less reliable."
        ),
    )


class RiskScore(BaseModel):
    """Risk scoring result produced by Agent A3."""

    model_config = ConfigDict(strict=True)

    clause_id: str
    legal_base: float = Field(..., ge=0, le=10, description="Legal risk base score 0-10")
    semantic_similarity: float = Field(..., ge=0, le=10, description="Semantic similarity 0-10")
    business_multiplier: float = Field(..., ge=0, le=10, description="Business context multiplier")
    final_score: float = Field(..., ge=0, le=10, description="Weighted final score")
    reasoning_trace: str = Field("", description="LLM chain-of-thought reasoning")


class ComplianceResult(BaseModel):
    """Compliance check result produced by Agent A4."""

    model_config = ConfigDict(strict=True)

    clause_id: str = Field("", description="Related clause ID (empty for global checks)")
    violation: bool = Field(..., description="Whether a violation was detected")
    statute: str = Field("", description="Statute reference, e.g. 'MSME Development Act 2006'")
    section: str = Field("", description="Section reference, e.g. 'Section 15'")
    excess_days: int = Field(0, ge=0, description="Days beyond statutory limit")
    interest_liability: float = Field(0.0, ge=0, description="Calculated interest liability in INR")
    details: str = Field("", description="Human-readable explanation")


class NegotiationRewrite(BaseModel):
    """Alternative clause wording produced by Agent A5."""

    model_config = ConfigDict(strict=True)

    clause_id: str
    original_text: str
    rewritten_text: str
    risk_reduction: float = Field(
        ..., ge=0, le=10, description="Expected score reduction after rewrite"
    )
    reasoning: str = Field("", description="Why this rewrite is recommended")


class Alert(BaseModel):
    """Lifecycle alert produced by Agent A7."""

    model_config = ConfigDict(strict=True)

    alert_type: Literal["deadline", "renewal", "compliance", "custom"] = "deadline"
    message: str = Field(..., description="Alert message")
    due_date: datetime | None = Field(None, description="When the alert fires")
    clause_id: str = Field("", description="Related clause ID")
    channel: Literal["whatsapp", "email", "sms"] = "whatsapp"
