"""MSME Development Act 2006, Section 15 — hardcoded statutory check.

If payment_days > 45:
    excess = payment_days - 45
    interest = contract_value × (rbi_rate × 3 / 100) × (excess / 365)
    → STATUTORY_VIOLATION

This is a deterministic rule — zero LLM calls.
"""

from __future__ import annotations

from contractguard.models.clauses import ComplianceResult


def check_msme_act(
    payment_days: int,
    contract_value: float,
    rbi_rate: float = 6.5,
    clause_id: str = "",
) -> ComplianceResult | None:
    """Check if payment terms violate MSME Development Act 2006 Section 15.

    Args:
        payment_days: Payment days specified in the clause.
        contract_value: Total contract value in INR.
        rbi_rate: Current RBI base rate (default 6.5%).
        clause_id: Optional clause identifier.

    Returns:
        ComplianceResult with violation=True if payment_days > 45, else None.
    """
    if payment_days > 45:
        excess = payment_days - 45
        interest = contract_value * (rbi_rate * 3 / 100) * (excess / 365)
        return ComplianceResult(
            clause_id=clause_id,
            violation=True,
            statute="MSME Development Act 2006",
            section="Section 15",
            excess_days=excess,
            interest_liability=round(interest, 2),
            details=(
                f"Payment term of {payment_days} days exceeds statutory limit of 45 days "
                f"by {excess} days. Estimated interest liability: ₹{interest:,.2f} "
                f"at {rbi_rate * 3}% p.a. (3× RBI rate)."
            ),
        )
    return None
