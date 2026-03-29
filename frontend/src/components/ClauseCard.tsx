import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle, ArrowRight, Lightbulb } from 'lucide-react';
import type { Clause, RiskScore, ComplianceResult, NegotiationRewrite } from '../lib/api';
import { getRiskColor, getRiskLabel, getRiskBg, clauseTypeLabel, formatSafeNumber, safeNumber, safeText } from '../lib/utils';

interface ClauseCardProps {
  clause: Clause;
  riskScore?: RiskScore;
  compliance?: ComplianceResult;
  rewrite?: NegotiationRewrite;
}

export default function ClauseCard({ clause, riskScore, compliance, rewrite }: ClauseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRewrite, setShowRewrite] = useState(false);

  const score = safeNumber(riskScore?.final_score, 0, `clause.${clause?.clause_id ?? 'unknown'}.risk.final_score`);
  const riskColor = getRiskColor(score);
  const riskLabel = getRiskLabel(score);
  const riskBg = getRiskBg(score);
  const clauseId = safeText(clause?.clause_id, '—', 'clause.clause_id');
  const clauseText = safeText(clause?.text, '—', `clause.${clauseId}.text`);
  const clauseType = safeText(clause?.clause_type, 'unknown', `clause.${clauseId}.clause_type`);
  const rewriteRiskReduction = safeNumber(rewrite?.risk_reduction, 0, `clause.${clauseId}.rewrite.risk_reduction`);
  const complianceInterestLiability = safeNumber(
    compliance?.interest_liability,
    0,
    `clause.${clauseId}.compliance.interest_liability`,
  );

  return (
    <div
      className="glass-card p-5 flex flex-col gap-3 transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.03)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(77,127,255,0.15)', color: '#4D7FFF', border: '1px solid rgba(77,127,255,0.3)' }}
          >
            {clauseId}
          </span>
          <span
            className="text-xs font-medium px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#A8B3C9', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            {clauseTypeLabel(clauseType)}
          </span>
          {compliance?.violation && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(232,71,95,0.15)', color: '#E8475F', border: '1px solid rgba(232,71,95,0.3)' }}
            >
              <AlertTriangle className="w-3 h-3" />
              VIOLATION
            </span>
          )}
        </div>
        {riskScore && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: riskBg, border: `1px solid ${riskColor}44` }}
          >
            <span className="font-mono font-bold text-sm" style={{ color: riskColor }}>
              {formatSafeNumber(score, 1)}
            </span>
            <span className="text-xs font-semibold" style={{ color: riskColor }}>
              {riskLabel}
            </span>
          </div>
        )}
      </div>

      {/* Clause text */}
      <p className="text-sm leading-relaxed" style={{ color: '#EAF1FF', opacity: 0.85 }}>
        {clauseText.length > 180 && !expanded
          ? clauseText.slice(0, 180) + '…'
          : clauseText}
      </p>

      {clauseText.length > 180 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs flex items-center gap-1 self-start transition-colors"
          style={{ color: '#4D7FFF' }}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? 'Show less' : 'Show full clause'}
        </button>
      )}

      {/* ── PHASE 5: Clause Impact Messages ── */}
      <div className="space-y-1.5">
        {score > 7 && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(232,71,95,0.1)', border: '1px solid rgba(232,71,95,0.25)' }}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#E8475F' }} />
            <span className="text-xs font-semibold" style={{ color: '#E8475F' }}>
              ⚠️ This clause can break your cash flow
            </span>
          </div>
        )}
        {compliance?.violation && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(232,71,95,0.1)', border: '1px solid rgba(232,71,95,0.3)' }}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#E8475F' }} />
            <span className="text-xs font-bold" style={{ color: '#E8475F' }}>
              ⚠️ Illegal under {compliance.statute}
            </span>
          </div>
        )}
        {rewrite && rewriteRiskReduction > 0 && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: 'rgba(46,204,153,0.08)', border: '1px solid rgba(46,204,153,0.2)' }}
          >
            <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2ECC99' }} />
            <span className="text-xs font-semibold" style={{ color: '#2ECC99' }}>
              💡 You can reduce risk by {formatSafeNumber(rewrite?.risk_reduction, 1, `clause.${clauseId}.rewrite.risk_reduction`)} points through negotiation
            </span>
          </div>
        )}
      </div>

      {/* Risk breakdown */}
      {riskScore && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Legal', value: riskScore.legal_base },
              { label: 'Semantic', value: riskScore.semantic_sim },
              { label: 'Business', value: riskScore.business_multiplier },
            ].map(({ label, value }) => {
              const safeValue = safeNumber(value, 0, `clause.${clauseId}.risk.${label.toLowerCase()}`);
              return (
                <div key={label} className="rounded-lg p-2 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xs mb-0.5" style={{ color: '#A8B3C9' }}>{label}</div>
                  <div className="font-mono font-semibold text-sm" style={{ color: getRiskColor(safeValue) }}>
                    {formatSafeNumber(safeValue, 1)}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Formula breakdown */}
          <div
            className="rounded-lg px-3 py-2 font-mono text-xs flex flex-wrap items-center gap-x-1.5 gap-y-1"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#A8B3C9' }}
          >
            <span style={{ color: '#4D7FFF' }}>{formatSafeNumber(safeNumber(riskScore.legal_base, 0, `clause.${clauseId}.risk.legal_base`), 1)}</span>
            <span>×0.4</span>
            <span style={{ color: 'rgba(168,179,201,0.5)' }}>+</span>
            <span style={{ color: '#4D7FFF' }}>{formatSafeNumber(safeNumber(riskScore.semantic_sim, 0, `clause.${clauseId}.risk.semantic_sim`), 1)}</span>
            <span>×0.3</span>
            <span style={{ color: 'rgba(168,179,201,0.5)' }}>+</span>
            <span style={{ color: '#4D7FFF' }}>{formatSafeNumber(safeNumber(riskScore.business_multiplier, 0, `clause.${clauseId}.risk.business_multiplier`), 1)}</span>
            <span>×0.3</span>
            <span style={{ color: 'rgba(168,179,201,0.5)' }}>=</span>
            <span className="font-bold" style={{ color: riskColor }}>{formatSafeNumber(score, 1)}</span>
          </div>
        </div>
      )}

      {/* Compliance detail */}
      {compliance?.violation && (
        <div className="rounded-xl p-3" style={{ background: 'rgba(232,71,95,0.08)', border: '1px solid rgba(232,71,95,0.2)' }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: '#E8475F' }} />
            <span className="text-xs font-bold" style={{ color: '#E8475F' }}>
              {safeText(compliance.statute, '—', `clause.${clauseId}.compliance.statute`)} · {safeText(compliance.section, '—', `clause.${clauseId}.compliance.section`)}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#EAF1FF', opacity: 0.75 }}>
            {safeText(compliance.details, '—', `clause.${clauseId}.compliance.details`)}
          </p>
          {complianceInterestLiability > 0 && (
            <div className="mt-2 text-xs font-semibold" style={{ color: '#E8475F' }}>
              Interest liability: ₹{Math.round(complianceInterestLiability).toLocaleString('en-IN')}
            </div>
          )}
        </div>
      )}

      {/* Rewrite toggle */}
      {rewrite && (
        <div>
          <button
            onClick={() => setShowRewrite(!showRewrite)}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{
              background: showRewrite ? 'rgba(46,204,153,0.15)' : 'rgba(46,204,153,0.08)',
              color: '#2ECC99',
              border: '1px solid rgba(46,204,153,0.25)',
            }}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            {showRewrite ? 'Hide' : 'Show'} negotiation rewrite
            <span className="ml-1 opacity-70">-{formatSafeNumber(rewrite?.risk_reduction, 1, `clause.${clauseId}.rewrite.risk_reduction`)} risk</span>
          </button>
          {showRewrite && (
            <div className="mt-3 rounded-xl p-4" style={{ background: 'rgba(46,204,153,0.06)', border: '1px solid rgba(46,204,153,0.2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <ArrowRight className="w-3.5 h-3.5" style={{ color: '#2ECC99' }} />
                <span className="text-xs font-bold" style={{ color: '#2ECC99' }}>SUGGESTED REWRITE</span>
              </div>
              <p className="text-sm leading-relaxed mb-3" style={{ color: '#EAF1FF', opacity: 0.9, fontFamily: '"JetBrains Mono", monospace', fontSize: '0.75rem' }}>
                {safeText(rewrite.rewritten_text, '—', `clause.${clauseId}.rewrite.rewritten_text`)}
              </p>
              <div className="text-xs" style={{ color: '#A8B3C9' }}>
                <span className="font-semibold" style={{ color: '#2ECC99' }}>Reasoning: </span>
                {safeText(rewrite.reasoning, '—', `clause.${clauseId}.rewrite.reasoning`)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
