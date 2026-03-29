const warnedMissingLabels = new Set<string>();

export function warnMissingValue(label: string, value: unknown): void {
  const valueKind = value === null ? 'null' : value === undefined ? 'undefined' : 'invalid';
  const warningKey = `${label}:${valueKind}`;
  if (warnedMissingLabels.has(warningKey)) return;
  warnedMissingLabels.add(warningKey);
  console.warn('[ContractGuard] Missing value:', label, value);
}

export function safeNumber(value: unknown, fallback = 0, label?: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (label) warnMissingValue(label, value);
  return fallback;
}

export function formatSafeNumber(value: unknown, decimals = 1, label?: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    if (label) warnMissingValue(label, value);
    return '—';
  }
  return value.toFixed(decimals);
}

export function safeText(value: unknown, fallback = '—', label?: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (label) warnMissingValue(label, value);
  return fallback;
}

export function formatINR(value: unknown): string {
  const amount = safeNumber(value, 0, 'formatINR.value');
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  } else if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)} L`;
  } else if (amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(1)}K`;
  }
  return `₹${amount.toFixed(0)}`;
}

export function getRiskColor(score: unknown): string {
  const safeScore = safeNumber(score, 0, 'risk.score');
  if (safeScore >= 7.0) return '#E8475F';
  if (safeScore >= 4.0) return '#F59E0B';
  return '#2ECC99';
}

export function getRiskLabel(score: unknown): string {
  const safeScore = safeNumber(score, 0, 'risk.label_score');
  if (safeScore >= 7.0) return 'Financially Dangerous';
  if (safeScore >= 4.0) return 'Manageable with Changes';
  return 'Safe to Proceed';
}

export function getRiskBg(score: unknown): string {
  const safeScore = safeNumber(score, 0, 'risk.bg_score');
  if (safeScore >= 8.5) return 'rgba(232,71,95,0.15)';
  if (safeScore >= 7.0) return 'rgba(232,71,95,0.1)';
  if (safeScore >= 4.0) return 'rgba(245,158,11,0.1)';
  return 'rgba(46,204,153,0.1)';
}

export function getSeverityColor(severity: string | null | undefined): string {
  switch (severity) {
    case 'critical': return '#E8475F';
    case 'high': return '#E8475F';
    case 'medium': return '#F59E0B';
    case 'low': return '#2ECC99';
    default: return '#A8B3C9';
  }
}

export function clauseTypeLabel(type: string): string {
  const safeType = safeText(type, 'Unknown clause', 'clause.type');
  return safeType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
