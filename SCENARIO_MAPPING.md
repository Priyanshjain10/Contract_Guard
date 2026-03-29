# ContractGuard — Track 5 Scenario Pack Mapping

## Track 5: Domain-Specialized AI Agents with Compliance Guardrails

ContractGuard is a financial domain compliance agent for Indian MSMEs,
built on the MSME Development Act 2006 (Section 15) and Indian Contract Act 1872.

---

## Must-Have Scenario 1 (Track 5): Financial Close Agent — Compliance Violation Detection

**Scenario:** Given a supplier contract with Net-90 payment terms for a
textile MSME (8% margin, 15-day supplier cycle), detect the MSME Act
violation, calculate interest liability, and generate negotiation alternatives.

**How ContractGuard handles it:**
- A1 extracts payment clause with 90-day term
- A2 computes sector_risk_weight=1.5 for textiles
- A3 scores clause at 8.4/10 (critical) using business context
- A4 detects Section 15 violation: 45 excess days → ₹26,630 interest liability
- GATE2 triggers critical risk escalation with audit trail
- A5 generates IDEAL/COMPROMISE/MINIMUM rewrites (Net-30 / Net-45 / Net-60)
- Autonomy loop sends negotiation email draft, simulates counterparty, re-scores

**Live demo:** POST /analyze with textile profile + Net-90 contract

---

## Must-Have Scenario 2 (Track 5): Edge Case — Ambiguous Payment Clause

**Scenario:** Contract contains "payment within a reasonable time" — no
specific day count. Agent must flag uncertainty and not guess.

**How ContractGuard handles it:**
- A1 marks clause as `is_ambiguous=True` (no payment_days extracted)
- A3 skips LLM scoring for ambiguous clauses, sets flag
- A4 skips compliance check, logs "payment_days unknown — cannot assess"
- GATE flags `GATE_ambiguous_clause=True`
- API response surfaces the flag; frontend shows warning banner

---

## Must-Have Scenario 3 (Track 5): Edge Case — Concentration Risk

**Scenario:** Contract value is 4× monthly revenue. Even a 30-day payment
term creates existential cash-flow risk for the MSME.

**How ContractGuard handles it:**
- A2 detects contract_value > 3 × monthly_revenue
- business_multiplier adds +1.5 concentration risk penalty
- A3 scores higher even for shorter payment terms
- A5 generates rewrites that include advance payment or milestone billing

---

## Surprise Scenario Readiness

The live judging round will introduce 2–3 surprise scenarios. ContractGuard
is built to handle:
- Any payment term (extractable via regex from natural language)
- Any sector (5 sector weights; defaults to 1.0 for unknown)
- Missing business profile (GATE1 pauses pipeline, returns pause_reason)
- Low OCR confidence (GATE1 routes to human_review_ocr)
- Multiple violations in one contract (all flagged, all interest calculated)

---
## Cross-Track Demonstration — Track 2 Scenario Handled

ContractGuard's architecture generalizes beyond contract analysis.
The same Groq backbone and structured-output discipline handles
Track 2's "Meeting to Action" scenario via POST /workflow/meeting-to-action.

When an action item has no clear owner, the agent:
- Sets owner = "UNASSIGNED" and flagged = true
- Never guesses — flags for human review
- Returns ambiguous_count in the response so the caller knows to follow up

This matches Track 2's scenario pack requirement exactly:
"One action item is ambiguous (no clear owner). The agent should flag it
and ask for clarification rather than guessing."
---
