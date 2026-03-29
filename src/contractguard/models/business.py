"""Business profile model — 5-field MSME context."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BusinessProfile(BaseModel):
    """Captures the MSME's business context for risk scoring.

    Fields:
        sector: Industry classification driving sector_weight.
        gross_margin_pct: Gross margin percentage (e.g. 8 for 8%).
        payment_cycle_days: Typical supplier payment cycle in days.
        monthly_revenue: Average monthly revenue in INR.
        contract_value: Total value of the contract being analysed in INR.
    """

    model_config = ConfigDict(strict=True)

    sector: Literal["textiles", "manufacturing", "trading", "IT", "services"] = Field(
        ..., description="Industry sector for sector_weight lookup"
    )
    gross_margin_pct: float = Field(
        ..., ge=0, le=100, description="Gross margin as a percentage"
    )
    payment_cycle_days: int = Field(
        ..., ge=0, description="Typical supplier payment cycle in days"
    )
    monthly_revenue: float = Field(
        ..., gt=0, description="Average monthly revenue in INR"
    )
    contract_value: float = Field(
        ..., gt=0, description="Total contract value in INR"
    )
