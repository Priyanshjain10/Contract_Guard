import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Copy, Check, TrendingDown, TrendingUp, AlertTriangle, Mail, Users, ChevronDown, ChevronUp, Zap, RefreshCw, ArrowRight, ShieldAlert, Lightbulb } from 'lucide-react';
import type { AnalyzeResponse } from '../lib/api';
import { formatINR, formatSafeNumber, safeNumber, safeText } from '../lib/utils';
import RiskGauge from './RiskGauge';
import ClauseCard from './ClauseCard';

interface ResultsDashboardProps {
  data: AnalyzeResponse;
}

function AnimatedNumber({ value, decimals = 1, color }: { value: number; decimals?: number; color: string }) {
  const motionVal = useMotionValue(0);
  const rounded = useTransform(motionVal, (v) => formatSafeNumber(v, decimals));
  useEffect(() => {
    const controls = animate(motionVal, safeNumber(value, 0, 'results.animated_number.value'), { duration: 1.2, ease: 'easeOut' });
    return controls.stop;
  }, [value, motionVal]);
  return <motion.span style={{ color }}>{rounded}</motion.span>;
}

const COUNTER_PROPOSAL_PREVIEW_LENGTH = 120;

export default function ResultsDashboard({ data }: ResultsDashboardProps) {
  const [copied, setCopied] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear copy-feedback timer on unmount to avoid setting state on an unmounted component
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  // Normalise potentially missing array fields so every .map() / .find() is safe
  const riskScores = data.risk_scores ?? [];
  const clauses = data.clauses ?? [];
  const complianceResults = data.compliance_results ?? [];
  const negotiationRewrites = data.negotiation_rewrites ?? [];
  const alerts = data.alerts ?? [];
  const estimatedLoss = safeNumber(data.estimated_loss, 0, 'results.estimated_loss');
  const estimatedSavings = safeNumber(data.estimated_savings, 0, 'results.estimated_savings');
  const interestExposure = safeNumber(data.impact_breakdown?.interest_exposure_inr, 0, 'results.impact_breakdown.interest_exposure_inr');
  const negotiationEmailDraft = safeText(data.negotiation_email_draft, '—', 'results.negotiation_email_draft');
  const finalDecision = safeText(data.final_decision, 'REVIEW_REQUIRED', 'results.final_decision');
  const counterpartyOutcome = safeText(data.counterparty_simulation?.outcome, '', 'results.counterparty_simulation.outcome');
  const counterpartyProposal = safeText(data.counterparty_simulation?.counter_proposal, '', 'results.counterparty_simulation.counter_proposal');
  const counterpartyReasoning = safeText(data.counterparty_simulation?.reasoning, '', 'results.counterparty_simulation.reasoning');

  const maxRisk = riskScores.length > 0
    ? Math.max(...riskScores.map(r => safeNumber(r.final_score, 0, `risk_scores.${r.clause_id}.final_score`)))
    : 0;

  // Compute after-negotiation max risk
  const afterScores = riskScores.map(rs => {
    const rewrite = negotiationRewrites.find(r => r.clause_id === rs.clause_id);
    return Math.max(0, safeNumber(rs.final_score, 0, `risk_scores.${rs.clause_id}.final_score`) - safeNumber(rewrite?.risk_reduction, 0, `negotiation_rewrites.${rs.clause_id}.risk_reduction`));
  });
  const maxRiskAfter = afterScores.length > 0 ? Math.max(...afterScores) : 0;

  const msmeViolations = complianceResults.filter(c => c.violation);

  const copyEmail = () => {
    if (negotiationEmailDraft === '—') return;
    navigator.clipboard.writeText(negotiationEmailDraft).then(() => {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    }).catch(() => {/* clipboard permission denied — silently ignore */});
  };

  const decisionConfig = {
    DO_NOT_SIGN: { color: '#E8475F', bg: 'rgba(232,71,95,0.15)', border: 'rgba(232,71,95,0.4)', label: 'Do Not Sign', glow: '0 0 30px rgba(232,71,95,0.3)' },
    SIGN_WITH_CAUTION: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', label: 'Sign with Changes', glow: '0 0 30px rgba(245,158,11,0.25)' },
    SIGN: { color: '#2ECC99', bg: 'rgba(46,204,153,0.15)', border: 'rgba(46,204,153,0.4)', label: 'Safe to Sign', glow: '0 0 30px rgba(46,204,153,0.25)' },
    NO_ACTION_REQUIRED: { color: '#2ECC99', bg: 'rgba(46,204,153,0.15)', border: 'rgba(46,204,153,0.4)', label: 'Safe to Proceed', glow: '0 0 30px rgba(46,204,153,0.25)' },
    REVIEW_REQUIRED: { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', label: 'Review Required', glow: '0 0 30px rgba(245,158,11,0.25)' },
  } as const;
  type DecisionKey = keyof typeof decisionConfig;
  const getDecisionKey = (d: string | null | undefined): DecisionKey => {
    if (!d) return 'REVIEW_REQUIRED';
    const keys: DecisionKey[] = ['DO_NOT_SIGN', 'SIGN_WITH_CAUTION', 'SIGN', 'NO_ACTION_REQUIRED', 'REVIEW_REQUIRED'];
    return keys.find(k => d.startsWith(k)) ?? 'REVIEW_REQUIRED';
  };
  const dec = decisionConfig[getDecisionKey(finalDecision)];
  const profile = data.business_profile;
  const profileSummary = profile && profile.sector != null && profile.gross_margin_pct != null && profile.payment_cycle_days != null
    ? `For a ${profile.sector} business with ${profile.gross_margin_pct}% margins and ${profile.payment_cycle_days} day cycle`
    : undefined;

  const actionDirectives: Record<DecisionKey, string> = {
    DO_NOT_SIGN: 'Do NOT sign this contract without changes',
    SIGN_WITH_CAUTION: 'Proceed only after negotiation fixes below',
    SIGN: 'Safe to proceed with this contract',
    NO_ACTION_REQUIRED: 'Safe to proceed — no critical issues found',
    REVIEW_REQUIRED: 'Review the flagged clauses before proceeding',
  };

  const paymentClause = clauses.find(c => c.clause_type === 'payment_terms');
  const contractPaymentDays = paymentClause?.payment_days != null
    ? safeNumber(paymentClause.payment_days, 0, 'results.payment_clause.payment_days')
    : null;
  const extraDaysLocked = profile && contractPaymentDays !== null
    ? contractPaymentDays - safeNumber(profile.payment_cycle_days, 0, 'results.business_profile.payment_cycle_days')
    : null;
  const contractValue = profile ? safeNumber(profile.contract_value, 0, 'results.business_profile.contract_value') : 0;
  const marginImpactPct = profile && estimatedLoss > 0 && contractValue > 0
    ? formatSafeNumber((estimatedLoss / contractValue) * 100, 0, 'results.margin_impact_pct')
    : null;

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  };

  return (
    <motion.div
      className="space-y-5"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── PHASE 3: DECISION HERO — most dominant element ── */}
      <motion.div
        variants={itemVariants}
        className="rounded-2xl relative overflow-hidden text-center"
        style={{
          background: dec.bg,
          border: `2px solid ${dec.border}`,
          boxShadow: dec.glow,
          padding: '2rem 1.5rem 2rem',
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 60%, ${dec.color}28 0%, transparent 70%)` }}
          animate={{ opacity: [0.35, 0.85, 0.35] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative">
          <p className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: dec.color, opacity: 0.75 }}>
            Contract Decision
          </p>
          <motion.h1
            className="font-black tracking-tight leading-none mb-4"
            style={{ color: dec.color, fontSize: 'clamp(2.8rem, 9vw, 5.5rem)' }}
            initial={{ scale: 0.65, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 160, damping: 14 }}
          >
            {dec.label}
          </motion.h1>
          {/* PHASE 5 — Personalization: directly under decision */}
          {profileSummary && (
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.07)', color: '#EAF1FF', border: '1px solid rgba(255,255,255,0.12)' }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <span style={{ color: dec.color }}>▸</span>
              {profileSummary}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* ── PHASE 2: NEXT STEP ACTION DIRECTIVE ── */}
      <motion.div variants={itemVariants} className="flex justify-center">
        <div
          className="inline-flex items-center gap-3 px-6 py-3 rounded-2xl w-full justify-center"
          style={{
            background: `${dec.color}1a`,
            border: `2px solid ${dec.color}50`,
          }}
        >
          <span className="text-lg font-black tracking-tight" style={{ color: dec.color }}>
            ⚡ {actionDirectives[getDecisionKey(finalDecision)]}
          </span>
        </div>
      </motion.div>

      {/* ── PHASE 3: IMPACT HEADLINE ── */}
      {estimatedLoss > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl p-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(232,71,95,0.18) 0%, rgba(232,71,95,0.06) 100%)',
            border: '1px solid rgba(232,71,95,0.45)',
            boxShadow: '0 0 40px rgba(232,71,95,0.12)',
          }}
        >
          {/* pulse glow */}
          <motion.div
            className="absolute inset-0 rounded-2xl"
            style={{ background: 'rgba(232,71,95,0.06)' }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-5 h-5" style={{ color: '#E8475F' }} />
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#E8475F' }}>
                Business Impact Warning
              </span>
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: '#A8B3C9' }}>
              This contract will likely cost you
            </p>
            <motion.div
              className="font-black leading-none mb-4"
              style={{ color: '#E8475F', fontSize: 'clamp(2.4rem, 8vw, 4.5rem)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
            >
              {formatINR(estimatedLoss)}
            </motion.div>
            {((extraDaysLocked !== null && extraDaysLocked > 0) || marginImpactPct !== null) && (
              <motion.div
                className="inline-flex flex-wrap items-center justify-center gap-3 mb-4"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                {extraDaysLocked !== null && extraDaysLocked > 0 && (
                  <span
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: 'rgba(232,71,95,0.2)', color: '#E8475F', border: '1px solid rgba(232,71,95,0.4)' }}
                  >
                    🔒 Cash locked for {extraDaysLocked} extra days
                  </span>
                )}
                {marginImpactPct !== null && (
                  <span
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: 'rgba(232,71,95,0.2)', color: '#E8475F', border: '1px solid rgba(232,71,95,0.4)' }}
                  >
                    📉 ~{marginImpactPct}% of contract value at risk
                  </span>
                )}
              </motion.div>
            )}
            <p className="text-sm leading-relaxed mb-4" style={{ color: '#A8B3C9' }}>
              Based on your margins and payment cycle, this contract creates{' '}
              <strong style={{ color: '#EAF1FF' }}>negative cash flow risk</strong>.
              The payment terms alone trap working capital for weeks beyond your operating cycle,
              threatening your business liquidity.
            </p>
            {msmeViolations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {msmeViolations.map((v, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: 'rgba(232,71,95,0.2)', color: '#E8475F', border: '1px solid rgba(232,71,95,0.5)' }}
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    ILLEGAL · {v.statute} {v.section}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── PHASE 4: BEFORE vs AFTER TRANSFORMATION ── */}
      {negotiationRewrites.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4" style={{ color: '#C9A96E' }} />
            <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
              Risk Transformation — Before vs After Negotiation
            </h3>
          </div>
          {/* Big reduction callout */}
          <motion.div
            className="text-center mb-5"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
          >
            <span
              className="font-mono font-black"
              style={{ color: '#2ECC99', fontSize: 'clamp(1.6rem, 5vw, 2.8rem)' }}
            >
               ↓ {formatSafeNumber(maxRisk - maxRiskAfter, 1, 'results.risk_reduction')} pts reduced
            </span>
            <span className="block text-xs font-semibold mt-0.5" style={{ color: '#A8B3C9' }}>
              with AI-powered negotiation
            </span>
          </motion.div>
          <div className="flex items-center justify-center gap-4 lg:gap-10">
            {/* Before */}
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#A8B3C9' }}>
                Before
              </div>
              <div
                className="w-28 h-28 lg:w-36 lg:h-36 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'rgba(232,71,95,0.12)',
                  border: '2px solid rgba(232,71,95,0.4)',
                  boxShadow: '0 0 30px rgba(232,71,95,0.15)',
                }}
              >
                <span className="font-mono font-black text-4xl lg:text-5xl" style={{ color: '#E8475F' }}>
                  <AnimatedNumber value={maxRisk} color="#E8475F" />
                </span>
              </div>
              <div className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: '#E8475F', background: 'rgba(232,71,95,0.15)' }}>
                Financially Dangerous
              </div>
            </div>

            {/* Arrow */}
            <div className="flex flex-col items-center gap-1">
              <motion.div
                animate={{ x: [0, 8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                <ArrowRight className="w-8 h-8" style={{ color: '#C9A96E' }} />
              </motion.div>
              <span className="text-xs font-semibold" style={{ color: '#C9A96E' }}>AI Negotiation</span>
            </div>

            {/* After */}
            <div className="flex flex-col items-center gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#A8B3C9' }}>
                After
              </div>
              <motion.div
                className="w-28 h-28 lg:w-36 lg:h-36 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'rgba(46,204,153,0.12)',
                  border: '2px solid rgba(46,204,153,0.4)',
                  boxShadow: '0 0 30px rgba(46,204,153,0.15)',
                }}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.8, type: 'spring', stiffness: 180 }}
              >
                <span className="font-mono font-black text-4xl lg:text-5xl" style={{ color: '#2ECC99' }}>
                  <AnimatedNumber value={maxRiskAfter} color="#2ECC99" />
                </span>
              </motion.div>
              <div className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: '#2ECC99', background: 'rgba(46,204,153,0.15)' }}>
                Manageable with Changes
              </div>
            </div>
          </div>

          {/* Savings callout */}
          {estimatedSavings > 0 && (
            <motion.div
              className="mt-5 rounded-xl px-5 py-3 flex items-center gap-3"
              style={{ background: 'rgba(46,204,153,0.08)', border: '1px solid rgba(46,204,153,0.2)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <Lightbulb className="w-4 h-4 flex-shrink-0" style={{ color: '#2ECC99' }} />
              <p className="text-xs" style={{ color: '#EAF1FF' }}>
                <strong style={{ color: '#2ECC99' }}>AI negotiation can recover {formatINR(estimatedSavings)}</strong>
                {' '}— by enforcing statutory rights and restructuring unfair clauses.
              </p>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ── RISK GAUGE + FINANCIALS ── */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Gauge */}
          <div className="flex flex-col items-center">
            <RiskGauge score={maxRisk} size={180} animate />
            <p className="text-xs mt-1" style={{ color: '#A8B3C9' }}>Peak Risk Score</p>
            <p className="text-xs text-center mt-2" style={{ color: '#A8B3C9' }}>
              Combined legal + business risk assessment
            </p>
            {interestExposure > 0 && (
              <p className="text-xs text-center mt-1" style={{ color: '#A8B3C9' }}>
                Statutory-delay interest exposure:{' '}
                <span style={{ color: '#E8475F', fontWeight: 700 }}>
                  {formatINR(interestExposure)}
                </span>
              </p>
            )}
          </div>

          {/* Financials */}
          <div className="flex flex-col gap-3">
            <div className="rounded-xl p-4" style={{ background: 'rgba(232,71,95,0.08)', border: '1px solid rgba(232,71,95,0.2)' }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4" style={{ color: '#E8475F' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#E8475F' }}>Potential Business Loss</span>
              </div>
              <div className="font-mono font-black text-2xl" style={{ color: '#E8475F' }}>
                {formatINR(estimatedLoss)}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: 'rgba(46,204,153,0.08)', border: '1px solid rgba(46,204,153,0.2)' }}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4" style={{ color: '#2ECC99' }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#2ECC99' }}>Recoverable with AI Negotiation</span>
              </div>
              <div className="font-mono font-black text-2xl" style={{ color: '#2ECC99' }}>
                {formatINR(estimatedSavings)}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── PHASE 6: TRUST SIGNALS ── */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-2 justify-center">
        {[
          { icon: '⚖️', label: 'Based on MSME Act 2006' },
          { icon: '🎯', label: 'Context-aware analysis' },
          { icon: '🤝', label: 'Legal + business logic combined' },
          { icon: '🇮🇳', label: 'Indian jurisdiction' },
        ].map((signal, i) => (
          <motion.span
            key={i}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'rgba(201,169,110,0.08)',
              color: '#C9A96E',
              border: '1px solid rgba(201,169,110,0.22)',
            }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
          >
            {signal.icon} {signal.label}
          </motion.span>
        ))}
      </motion.div>

      {/* ── ALERTS ── */}
      {alerts.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4" style={{ color: '#E8475F' }} />
            <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
              Risk Alerts ({alerts.length})
            </h3>
          </div>
          <div className="space-y-2">
            {alerts.map((alert, i) => {
              const severityColors: Record<string, { color: string; bg: string; border: string }> = {
                critical: { color: '#E8475F', bg: 'rgba(232,71,95,0.1)', border: 'rgba(232,71,95,0.25)' },
                high: { color: '#E8475F', bg: 'rgba(232,71,95,0.08)', border: 'rgba(232,71,95,0.2)' },
                medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
                low: { color: '#2ECC99', bg: 'rgba(46,204,153,0.08)', border: 'rgba(46,204,153,0.2)' },
              };
              const sc = severityColors[alert.severity] ?? severityColors.low;
              return (
                <motion.div
                  key={i}
                  className="rounded-xl p-3.5 flex gap-3"
                  style={{ background: sc.bg, border: `1px solid ${sc.border}` }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: sc.color, background: `${sc.color}22` }}>
                      {safeText(alert.severity, 'low').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold mb-0.5" style={{ color: sc.color }}>
                      {safeText(alert.alert_type, '—').replace(/_/g, ' ')} · {safeText(alert.clause_id, '—')}
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: '#EAF1FF', opacity: 0.8 }}>{safeText(alert.message, '—')}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── CLAUSE CARDS ── */}
      <motion.div variants={itemVariants}>
        <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#C9A96E' }}>
          Clause Analysis ({clauses.length} clauses)
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {clauses.map((clause, i) => (
            <motion.div
              key={clause.clause_id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <ClauseCard
                clause={clause}
                riskScore={riskScores.find(r => r.clause_id === clause.clause_id)}
                compliance={complianceResults.find(c => c.clause_id === clause.clause_id)}
                rewrite={negotiationRewrites.find(r => r.clause_id === clause.clause_id)}
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── PHASE 4: AUTONOMY LOOP HERO FEATURE ── */}
      <motion.div variants={itemVariants}>
        <div
          className="rounded-2xl p-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(201,169,110,0.1) 0%, rgba(201,169,110,0.03) 100%)',
            border: '1px solid rgba(201,169,110,0.35)',
            boxShadow: '0 0 40px rgba(201,169,110,0.08)',
          }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(201,169,110,0.2)', border: '1px solid rgba(201,169,110,0.3)' }}>
              <RefreshCw className="w-5 h-5" style={{ color: '#C9A96E' }} />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-wide" style={{ color: '#C9A96E' }}>
                AI Negotiation Simulation
              </h3>
              <p className="text-xs" style={{ color: '#A8B3C9' }}>
                Autonomy loop · Email → Simulate → Re-score → Decide
              </p>
            </div>
            {data.counterparty_simulation?.outcome && (
              <span
                className="ml-auto text-xs px-3 py-1.5 rounded-full font-bold capitalize"
                style={{
                    background: counterpartyOutcome === 'full' ? 'rgba(46,204,153,0.15)' : 'rgba(245,158,11,0.15)',
                    color: counterpartyOutcome === 'full' ? '#2ECC99' : '#F59E0B',
                    border: `1px solid ${counterpartyOutcome === 'full' ? 'rgba(46,204,153,0.3)' : 'rgba(245,158,11,0.3)'}`,
                  }}
                >
                  {counterpartyOutcome} acceptance
                </span>
              )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {/* AI Suggested */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(77,127,255,0.08)', border: '1px solid rgba(77,127,255,0.2)' }}>
              <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#4D7FFF' }}>
                <Zap className="w-3.5 h-3.5" />
                AI Suggested
              </div>
                <p className="text-xs leading-relaxed" style={{ color: '#EAF1FF', opacity: 0.8 }}>
                  {negotiationRewrites.length > 0
                  ? `${negotiationRewrites.length} clause rewrites generated to reduce total risk by ${formatSafeNumber(negotiationRewrites.reduce((s, r) => s + safeNumber(r.risk_reduction, 0, `negotiation_rewrites.${r.clause_id}.risk_reduction`), 0), 1, 'results.total_risk_reduction')} points`
                  : 'No rewrites needed'}
                </p>
              </div>

            {/* Counterparty Response */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#F59E0B' }}>
                <Users className="w-3.5 h-3.5" />
                Counterparty Likely Response
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#EAF1FF', opacity: 0.8 }}>
                {counterpartyProposal
                  ? counterpartyProposal.slice(0, COUNTER_PROPOSAL_PREVIEW_LENGTH) + (counterpartyProposal.length > COUNTER_PROPOSAL_PREVIEW_LENGTH ? '…' : '')
                  : 'No simulation available'}
              </p>
            </div>

            {/* Risk Change */}
            <div className="rounded-xl p-4" style={{ background: 'rgba(46,204,153,0.08)', border: '1px solid rgba(46,204,153,0.2)' }}>
              <div className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#2ECC99' }}>
                <TrendingDown className="w-3.5 h-3.5" />
                Risk After Negotiation
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono font-black text-2xl" style={{ color: '#2ECC99' }}>
                  {formatSafeNumber(maxRiskAfter, 1, 'results.max_risk_after')}
                </span>
                <span className="text-xs font-bold" style={{ color: '#2ECC99' }}>
                  ↓ {formatSafeNumber(maxRisk - maxRiskAfter, 1, 'results.risk_delta')} pts
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#A8B3C9' }}>Peak risk reduced</p>
            </div>
          </div>

          {counterpartyReasoning && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs leading-relaxed" style={{ color: '#A8B3C9' }}>
                <span className="font-semibold" style={{ color: '#C9A96E' }}>AI Reasoning: </span>
                {counterpartyReasoning}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── NEGOTIATION EMAIL ── */}
      <motion.div
        variants={itemVariants}
        className="glass-card p-5"
      >
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-4 h-4" style={{ color: '#4D7FFF' }} />
          <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
            Auto-Generated Negotiation Email
          </h3>
          <div className="ml-auto flex gap-2">
            <button
              onClick={copyEmail}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: copied ? 'rgba(46,204,153,0.15)' : 'rgba(77,127,255,0.1)',
                color: copied ? '#2ECC99' : '#4D7FFF',
                border: `1px solid ${copied ? 'rgba(46,204,153,0.3)' : 'rgba(77,127,255,0.25)'}`,
              }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setEmailExpanded(!emailExpanded)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#A8B3C9', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {emailExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div
          className="rounded-xl p-4 font-mono text-xs leading-relaxed overflow-hidden transition-all duration-300"
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(77,127,255,0.15)',
            color: '#EAF1FF',
            maxHeight: emailExpanded ? '600px' : '120px',
            WebkitMaskImage: emailExpanded ? 'none' : 'linear-gradient(to bottom, black 60%, transparent 100%)',
            maskImage: emailExpanded ? 'none' : 'linear-gradient(to bottom, black 60%, transparent 100%)',
          }}
        >
          <pre className="whitespace-pre-wrap">{negotiationEmailDraft}</pre>
        </div>
        {!emailExpanded && (
          <button
            onClick={() => setEmailExpanded(true)}
            className="w-full text-xs mt-2 py-1.5 rounded-lg font-medium"
            style={{ color: '#4D7FFF', background: 'rgba(77,127,255,0.06)', border: '1px solid rgba(77,127,255,0.15)' }}
          >
            Show full email ↓
          </button>
        )}
      </motion.div>

      <motion.div variants={itemVariants} className="text-center py-8">
        <div
          className="h-px mx-auto mb-8"
          style={{ width: '240px', background: 'linear-gradient(to right, transparent, rgba(201,169,110,0.45), transparent)' }}
        />
        <motion.p
          className="font-black tracking-tight"
          style={{ color: '#EAF1FF', fontSize: 'clamp(1.4rem, 4.5vw, 2.2rem)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          Don’t sign blindly.
        </motion.p>
        <motion.p
          className="font-black tracking-tight"
          style={{ color: '#C9A96E', fontSize: 'clamp(1.4rem, 4.5vw, 2.2rem)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          Sign with intelligence.
        </motion.p>
        <motion.p
          className="text-sm mt-3 font-semibold"
          style={{ color: '#A8B3C9' }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          AI-powered contract risk intelligence for MSMEs
        </motion.p>
        <motion.p
          className="text-xs mt-4 font-semibold tracking-widest uppercase"
          style={{ color: '#A8B3C9', opacity: 0.55 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.55 }}
          transition={{ delay: 0.8 }}
        >
          ContractGuard · MSME Protection · AI-Powered
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
