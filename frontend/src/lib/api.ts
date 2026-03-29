const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000';

export interface BusinessProfile {
  sector: 'textiles' | 'manufacturing' | 'trading' | 'IT' | 'services';
  gross_margin_pct: number;
  payment_cycle_days: number;
  monthly_revenue: number;
  contract_value: number;
}

export interface AnalyzeRequest {
  business_profile: BusinessProfile;
  contract_text: string;
}

export interface Clause {
  clause_id: string;
  text: string;
  clause_type: string;
  payment_days?: number;
  confidence: number;
}

export interface RiskScore {
  clause_id: string;
  legal_base: number;
  semantic_sim: number;
  business_multiplier: number;
  final_score: number;
  reasoning_trace: string;
}

export interface ComplianceResult {
  clause_id: string;
  violation: boolean;
  statute: string;
  section: string;
  excess_days?: number;
  interest_liability?: number;
  details: string;
}

export interface NegotiationRewrite {
  clause_id: string;
  risk_reduction: number;
  rewritten_text: string;
  reasoning: string;
}

export interface Alert {
  clause_id: string;
  alert_type: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ExecutionLog {
  agent: string;
  status: 'success' | 'error' | 'running';
  duration_ms: number;
}

export interface CounterpartySimulation {
  outcome: string;
  counter_proposal: string;
  reasoning: string;
}

export interface GateFlags {
  GATE1_low_ocr: boolean;
  GATE2_critical_risk: boolean;
}

export interface AnalyzeResponse {
  analysis_id: string;
  business_profile?: BusinessProfile;
  clauses?: Clause[];
  risk_scores?: RiskScore[];
  compliance_results?: ComplianceResult[];
  negotiation_rewrites?: NegotiationRewrite[];
  alerts?: Alert[];
  final_decision?: string;
  negotiation_email_draft?: string;
  counterparty_simulation?: CounterpartySimulation;
  estimated_loss?: number;
  estimated_savings?: number;
  impact_breakdown?: {
    interest_exposure_inr?: number;
    total_violations?: number;
    assumptions?: string;
  };
  gate_flags?: GateFlags;
  ocr_confidence?: number;
  sector_risk_weight?: number;
  handoff_log?: string[];
  execution_logs?: ExecutionLog[];
  audit_event_count?: number;
  error: string | null;
  pause_reason?: string;
}

export async function analyzeContract(
  request: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => `HTTP ${response.status}`);
    throw new Error(errText || `API error: ${response.status}`);
  }
  return response.json();
}

export async function checkHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error('Health check failed');
  return response.json();
}
