"""Tests for the deterministic scoring formula and MSME Act check."""

from contractguard.models.business import BusinessProfile
from contractguard.pipeline.agents.a1_doc_intelligence import _extract_clauses
from contractguard.scoring.formula import business_multiplier, risk_score
from contractguard.scoring.msme_act import check_msme_act

# ---------------------------------------------------------------------------
# Scoring formula invariants (from AGENTS.md)
# ---------------------------------------------------------------------------


def test_textile_msme_net90_scores_high():
    """textile(margin=8, cycle=15) + Net-90 → score ≥ 8.0"""
    profile = BusinessProfile(
        sector="textiles",
        gross_margin_pct=8.0,
        payment_cycle_days=15,
        monthly_revenue=500_000.0,
        contract_value=2_000_000.0,
    )
    biz = business_multiplier(profile, clause_days=90)
    # Use high legal_base and semantic_sim for a textile MSME with Net-90
    final = risk_score(legal_base=8.0, semantic_sim=8.0, biz_mult=biz)
    assert final >= 8.0, f"Textile MSME + Net-90 should score ≥ 8.0, got {final:.2f}"


def test_it_firm_net90_scores_low():
    """IT(margin=62, cycle=0) + Net-90 → score ≤ 4.0"""
    profile = BusinessProfile(
        sector="IT",
        gross_margin_pct=62.0,
        payment_cycle_days=0,
        monthly_revenue=5_000_000.0,
        contract_value=10_000_000.0,
    )
    biz = business_multiplier(profile, clause_days=90)
    # IT firm with high margin → low legal/semantic risk for same clause
    final = risk_score(legal_base=3.0, semantic_sim=2.5, biz_mult=biz)
    assert final <= 4.0, f"IT firm + Net-90 should score ≤ 4.0, got {final:.2f}"


def test_business_multiplier_low_margin_adds_bonus():
    """Margin < 15% adds 2.5 to base."""
    profile = BusinessProfile(
        sector="textiles",
        gross_margin_pct=8.0,
        payment_cycle_days=15,
        monthly_revenue=500_000.0,
        contract_value=500_000.0,
    )
    biz = business_multiplier(profile, clause_days=90)
    assert biz > 7.0, f"Low-margin textile should have high multiplier, got {biz:.2f}"


def test_business_multiplier_high_margin_no_bonus():
    """Margin >= 15% does NOT add bonus."""
    profile = BusinessProfile(
        sector="IT",
        gross_margin_pct=62.0,
        payment_cycle_days=0,
        monthly_revenue=5_000_000.0,
        contract_value=5_000_000.0,
    )
    biz = business_multiplier(profile, clause_days=90)
    # IT sector_weight=0.8, base stays at 5.0 + gap contribution
    assert biz < 7.0, f"High-margin IT should have moderate multiplier, got {biz:.2f}"


def test_risk_score_weights():
    """Verify the weight formula: 0.4 * L + 0.3 * S + 0.3 * B."""
    result = risk_score(10.0, 10.0, 10.0)
    assert result == 10.0

    result = risk_score(0.0, 0.0, 0.0)
    assert result == 0.0

    result = risk_score(5.0, 5.0, 5.0)
    assert result == 5.0


# ---------------------------------------------------------------------------
# MSME Act Section 15 checks
# ---------------------------------------------------------------------------


def test_msme_act_violation_at_90_days():
    """Payment > 45 days triggers violation."""
    result = check_msme_act(payment_days=90, contract_value=1_000_000.0)
    assert result is not None
    assert result.violation is True
    assert result.statute == "MSME Development Act 2006"
    assert result.section == "Section 15"
    assert result.excess_days == 45
    assert result.interest_liability > 0


def test_msme_act_no_violation_at_30_days():
    """Payment ≤ 45 days: no violation."""
    result = check_msme_act(payment_days=30, contract_value=1_000_000.0)
    assert result is None


def test_msme_act_boundary_at_45_days():
    """Payment exactly 45 days: no violation."""
    result = check_msme_act(payment_days=45, contract_value=1_000_000.0)
    assert result is None


def test_msme_act_boundary_at_46_days():
    """Payment 46 days: violation with 1 excess day."""
    result = check_msme_act(payment_days=46, contract_value=1_000_000.0)
    assert result is not None
    assert result.excess_days == 1


def test_msme_act_interest_calculation():
    """Verify interest formula: value × (RBI × 3 / 100) × (excess / 365)."""
    result = check_msme_act(
        payment_days=90, contract_value=1_000_000.0, rbi_rate=6.5
    )
    assert result is not None
    expected_interest = 1_000_000.0 * (6.5 * 3 / 100) * (45 / 365)
    assert abs(result.interest_liability - round(expected_interest, 2)) < 0.01


def test_extract_clauses_uses_header_boundaries_when_present():
    """Header-style clause documents should be split by detected headers."""
    text = (
        "1. PAYMENT TERMS\nPayment shall be made within 90 days of invoice date.\n\n"
        "2. LIABILITY\nSupplier bears full liability without cap.\n\n"
        "3. TERMINATION\nClient may terminate with 7 days notice.\n\n"
        "4. RENEWAL\nContract auto-renews annually.\n"
    )
    clauses = _extract_clauses(text)
    assert len(clauses) >= 3
    assert clauses[0].clause_type == "payment_terms"


def test_extract_clauses_falls_back_to_paragraph_split():
    """Documents without enough headers should be split on paragraphs."""
    text = (
        "Payment shall be made within 90 days of invoice date.\n\n"
        "Supplier indemnifies client against all third-party claims.\n\n"
        "Client may assign this contract without supplier consent."
    )
    clauses = _extract_clauses(text)
    assert len(clauses) == 3
