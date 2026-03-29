"""Deterministic scoring formula — the core IP of ContractGuard.

Same Net-90 clause scores 8.4 for textile MSME (8% margin, 15-day cycle)
and 3.1 for IT firm (62% margin). Context-aware scoring is the core IP.

Weights (never change):
    Score = (Legal_Base × 0.4) + (Semantic_Sim × 0.3) + (Business_Multiplier × 0.3)
"""

from __future__ import annotations

from contractguard.models.business import BusinessProfile

SECTOR_WEIGHTS: dict[str, float] = {
    "textiles": 1.5,
    "manufacturing": 1.2,
    "trading": 1.3,
    "IT": 0.8,
    "services": 0.9,
}


def business_multiplier(
    profile: BusinessProfile,
    clause_days: int,
    sector_risk_weight_override: float | None = None,
) -> float:
    """Calculate the business-context multiplier for a payment clause.

    Args:
        profile: MSME business profile with sector, margin, cycle, revenue, value.
        clause_days: Payment days specified in the contract clause.

    Returns:
        Business multiplier clamped to [0, 10].
    """
    base = 5.0

    # Low-margin MSMEs are hit harder by delayed payments
    if profile.gross_margin_pct < 15:
        base += 2.5

    # Gap between clause payment terms and the MSME's own payment cycle
    gap = max(0, clause_days - profile.payment_cycle_days - 30)
    base += gap * 0.05

    # Large contracts relative to revenue amplify risk
    if profile.contract_value > 3 * profile.monthly_revenue:
        base += 1.5

    sector_weight = (
        sector_risk_weight_override
        if sector_risk_weight_override is not None
        else SECTOR_WEIGHTS.get(profile.sector, 1.0)
    )
    return min(base * sector_weight, 10.0)


def risk_score(legal_base: float, semantic_sim: float, biz_mult: float) -> float:
    """Final weighted risk score.

    Score = (Legal_Base × 0.4) + (Semantic_Sim × 0.3) + (Business_Multiplier × 0.3)

    All inputs should be on a 0–10 scale.

    Args:
        legal_base: Legal risk base score (0-10).
        semantic_sim: Semantic similarity to known risky patterns (0-10).
        biz_mult: Business context multiplier (0-10).

    Returns:
        Weighted risk score (0-10).
    """
    return (legal_base * 0.4) + (semantic_sim * 0.3) + (biz_mult * 0.3)
