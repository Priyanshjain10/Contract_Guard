import type { AnalyzeResponse } from './api';

export const DEMO_CONTRACT_TEXT = `PAYMENT TERMS: The Buyer agrees to make payment within 90 (ninety) calendar days from the date of invoice. Late payment shall not attract any interest or penalty.

PENALTY CLAUSE: In the event of early termination by either party, the MSME supplier shall forfeit the entire security deposit and pay liquidated damages equal to 15% of the remaining contract value.

EXCLUSIVITY CLAUSE: The Supplier agrees to exclusively supply goods to the Buyer for a period of 24 months and shall not engage with any competitor or accept any other orders without prior written consent of the Buyer.

RENEWAL CLAUSE: This contract shall automatically renew for successive 12-month periods unless 6 (six) months' prior written notice is given by either party.

DISPUTE RESOLUTION: All disputes shall be resolved by arbitration in Mumbai, with the Buyer having the right to appoint the sole arbitrator.`;

export const DEMO_BUSINESS_PROFILE = {
  sector: 'textiles' as const,
  gross_margin_pct: 8,
  payment_cycle_days: 15,
  monthly_revenue: 500000,
  contract_value: 2000000,
};

export const DEMO_RESPONSE: AnalyzeResponse = {
  analysis_id: 'CG-demo1234abcd',
  business_profile: DEMO_BUSINESS_PROFILE,
  clauses: [
    {
      clause_id: 'C1',
      text: 'The Buyer agrees to make payment within 90 (ninety) calendar days from the date of invoice.',
      clause_type: 'payment_terms',
      payment_days: 90,
      confidence: 0.97,
    },
    {
      clause_id: 'C2',
      text: 'The MSME supplier shall forfeit the security deposit and pay liquidated damages equal to 15% of the remaining contract value.',
      clause_type: 'penalty_clause',
      confidence: 0.94,
    },
    {
      clause_id: 'C3',
      text: 'The Supplier agrees to exclusively supply goods to the Buyer for a period of 24 months.',
      clause_type: 'exclusivity_clause',
      confidence: 0.91,
    },
    {
      clause_id: 'C4',
      text: 'This contract shall automatically renew for successive 12-month periods unless 6 months prior notice is given.',
      clause_type: 'auto_renewal',
      confidence: 0.88,
    },
  ],
  risk_scores: [
    { clause_id: 'C1', legal_base: 9.2, semantic_sim: 8.8, business_multiplier: 9.0, final_score: 9.0, reasoning_trace: 'Net-90 payment terms violate MSME Act Section 15 which mandates payment within 45 days maximum. With your 15-day payment cycle, this creates a 75-day cash flow deficit on a ₹20L contract.' },
    { clause_id: 'C2', legal_base: 7.8, semantic_sim: 7.2, business_multiplier: 8.3, final_score: 7.8, reasoning_trace: 'One-sided penalty clause with 15% liquidated damages is asymmetric. Coupled with forfeiture of security deposit, the financial exposure is disproportionate.' },
    { clause_id: 'C3', legal_base: 6.5, semantic_sim: 6.8, business_multiplier: 7.1, final_score: 6.8, reasoning_trace: '24-month exclusivity severely restricts MSME business flexibility. Inability to diversify revenue streams creates existential concentration risk.' },
    { clause_id: 'C4', legal_base: 4.2, semantic_sim: 4.5, business_multiplier: 4.8, final_score: 4.5, reasoning_trace: 'Auto-renewal with 6-month notice is unusually long. Standard commercial practice is 30-60 days. Creates lock-in risk.' },
  ],
  compliance_results: [
    { clause_id: 'C1', violation: true, statute: 'MSME Development Act 2006', section: 'Section 15', excess_days: 45, interest_liability: 26630, details: 'Payment terms exceed the 45-day statutory maximum under the MSME Development Act 2006. The buyer becomes liable to pay compound interest at 3x bank rate on the delayed amount.' },
    { clause_id: 'C2', violation: true, statute: 'Indian Contract Act 1872', section: 'Section 74', excess_days: 0, interest_liability: 0, details: 'Liquidated damages clause may be unenforceable if it constitutes a penalty. Courts apply reasonableness test under Section 74.' },
    { clause_id: 'C3', violation: false, statute: 'Competition Act 2002', section: 'Section 3', details: 'Exclusivity clause warrants monitoring. While not an immediate violation, 24-month exclusive dealing may attract scrutiny under Competition Act if it creates appreciable adverse effect on competition.' },
    { clause_id: 'C4', violation: false, statute: 'N/A', section: 'N/A', details: 'Auto-renewal clause is legally valid but commercially unfavorable. No statutory violation identified.' },
  ],
  negotiation_rewrites: [
    { clause_id: 'C1', risk_reduction: 4.5, rewritten_text: 'The Buyer shall make payment within 30 (thirty) calendar days from the date of invoice. For payments delayed beyond 45 days, compound interest at three times the bank rate notified by the Reserve Bank of India shall be payable, as mandated by the MSME Development Act 2006.', reasoning: 'Reduced to 30 days (below 45-day statutory limit) and added mandatory interest clause per MSME Act.' },
    { clause_id: 'C2', risk_reduction: 3.2, rewritten_text: 'In the event of early termination by the Buyer, the Buyer shall pay the Supplier 15% of the remaining contract value. In the event of early termination by the Supplier for material breach by Buyer, the security deposit shall be refunded in full within 15 days.', reasoning: 'Made penalty clause bilateral. Protects MSME from one-sided forfeiture.' },
    { clause_id: 'C3', risk_reduction: 2.8, rewritten_text: "The Supplier agrees to treat the Buyer as a preferred supplier and maintain capacity allocation for the Buyer's forecasted requirements. The Supplier may accept orders from other buyers provided such orders do not compromise delivery commitments to the Buyer.", reasoning: 'Replaced hard exclusivity with preferred supplier status, preserving MSME revenue diversification rights.' },
    { clause_id: 'C4', risk_reduction: 1.5, rewritten_text: "This contract shall automatically renew for successive 12-month periods unless 60 (sixty) days' prior written notice of non-renewal is given by either party before the expiry date.", reasoning: 'Reduced notice period from 6 months to 60 days, aligning with industry standard.' },
  ],
  alerts: [
    { clause_id: 'C1', alert_type: 'STATUTORY_VIOLATION', message: 'CRITICAL: Net-90 payment terms violate MSME Development Act 2006, Section 15. Maximum permitted is 45 days. Buyer is liable for compound interest at 3× RBI bank rate on ₹20L outstanding.', severity: 'critical' },
    { clause_id: 'C2', alert_type: 'UNFAIR_TERMS', message: 'HIGH RISK: One-sided liquidated damages clause. Supplier forfeits deposit AND pays 15% damages. Consider bilateral penalty structure.', severity: 'high' },
    { clause_id: 'C3', alert_type: 'BUSINESS_RISK', message: 'MEDIUM RISK: 24-month exclusivity clause creates significant revenue concentration risk for a textiles MSME.', severity: 'medium' },
    { clause_id: 'C4', alert_type: 'COMMERCIAL_RISK', message: 'LOW-MEDIUM: 6-month auto-renewal notice period is 3-6x industry standard. Creates long lock-in.', severity: 'medium' },
  ],
  final_decision: 'DO_NOT_SIGN',
  negotiation_email_draft: `Subject: Contract Review & Proposed Amendments — [Contract Reference]

Dear [Counterparty Name],

Thank you for sharing the draft contract for our consideration. We have completed a thorough legal and commercial review and wish to propose the following amendments before proceeding.

1. PAYMENT TERMS (Clause 1) — Mandatory Statutory Compliance
   Current: Net-90 days | Proposed: Net-30 days
   
   We respectfully draw your attention to Section 15 of the MSME Development Act 2006, which mandates payment to MSME suppliers within a maximum of 45 days. The current Net-90 terms create a statutory liability for compound interest at 3× the RBI bank rate. We propose Net-30 payment terms to ensure compliance and avoid legal complications for both parties.

2. PENALTY CLAUSE (Clause 2) — Bilateral Application
   Current: One-sided (Supplier only) | Proposed: Bilateral
   
   We propose that any liquidated damages clause apply equally to both parties. We are committed to this partnership and propose a bilateral structure that reflects mutual accountability.

3. EXCLUSIVITY CLAUSE (Clause 3) — Preferred Supplier Status
   Current: 24-month hard exclusivity | Proposed: Preferred supplier arrangement
   
   As a growing MSME, maintaining operational resilience requires revenue diversification. We propose a preferred supplier arrangement that guarantees your capacity requirements are met while allowing us to accept supplementary orders.

4. RENEWAL NOTICE (Clause 4) — Standard Notice Period
   Current: 6 months notice | Proposed: 60 days notice
   
   We propose alignment with industry-standard notice periods of 60 days for non-renewal.

We believe these amendments create a more equitable partnership foundation. We are happy to schedule a call to discuss further.

Regards,
[MSME Representative]
[Company Name] | [Contact Details]`,
  counterparty_simulation: {
    outcome: 'partial',
    counter_proposal: 'Buyer may accept Net-45 payment terms (minimum statutory compliance) and bilateral renewal notice, but is likely to resist changes to exclusivity and penalty clauses. Recommend prioritizing payment terms amendment as non-negotiable statutory requirement.',
    reasoning: 'Based on sector analysis and typical large-buyer negotiation patterns in the textiles industry, payment terms aligned to statutory requirements are generally accepted when framed as compliance obligations. Exclusivity and penalty clauses typically require 2-3 rounds of negotiation.',
  },
  estimated_loss: 180000,
  estimated_savings: 450000,
  impact_breakdown: {
    interest_exposure_inr: 51428.57,
    total_violations: 2,
    assumptions: 'estimated_loss = interest_exposure × 3.5; savings = exposure × 2.1',
  },
  gate_flags: { GATE1_low_ocr: false, GATE2_critical_risk: true },
  ocr_confidence: 0.97,
  sector_risk_weight: 1.5,
  handoff_log: ['A1 → A2', 'A2 → A3', 'A2 → A4', 'A3 → A5', 'A4 → A5', 'A5 → A6', 'A5 → A7', 'A6 → Decision'],
  execution_logs: [
    { agent: 'a1_doc_intelligence', status: 'success', duration_ms: 142 },
    { agent: 'a2_business_profiler', status: 'success', duration_ms: 89 },
    { agent: 'a3_risk_scorer', status: 'success', duration_ms: 1240 },
    { agent: 'a4_compliance_guard', status: 'success', duration_ms: 780 },
    { agent: 'a5_negotiation', status: 'success', duration_ms: 2100 },
    { agent: 'a6_audit_trail', status: 'success', duration_ms: 45 },
    { agent: 'a7_lifecycle_monitor', status: 'success', duration_ms: 67 },
    { agent: 'autonomy_loop', status: 'success', duration_ms: 3400 },
  ],
  audit_event_count: 12,
  error: null,
  pause_reason: '',
};

export const DEMO_BUSINESS_PROFILE_IT = {
  sector: 'IT' as const,
  gross_margin_pct: 62,
  payment_cycle_days: 0,
  monthly_revenue: 5000000,
  contract_value: 10000000,
};

export const DEMO_COMPARISON = {
  clause: 'Payment shall be made within 90 (ninety) calendar days from the date of invoice. Late payment shall not attract any interest or penalty.',
  tagline: 'Same Net-90 clause. Same contract text. Different business reality.',
  profiles: [
    {
      name: 'Sunita Fabrics',
      sector: 'Textiles',
      margin: '8%',
      paymentCycle: '15 days',
      monthlyRevenue: '₹5,00,000',
      score: 9.0,
      verdict: 'DO_NOT_SIGN' as const,
      verdictLabel: 'Do Not Sign',
      interestLiability: 26630,
      color: 'red',
      reason: 'Low margin + long payment gap + statutory violation = critical risk',
    },
    {
      name: 'Kiran Tech Solutions',
      sector: 'IT',
      margin: '62%',
      paymentCycle: '0 days',
      monthlyRevenue: '₹50,00,000',
      score: 3.1,
      verdict: 'SIGN' as const,
      verdictLabel: 'Safe to Sign',
      interestLiability: 0,
      color: 'green',
      reason: 'High margin + no payment cycle dependency = low risk',
    },
  ],
};
