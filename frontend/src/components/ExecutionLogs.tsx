import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Terminal, ArrowRight, Clock } from 'lucide-react';
import type { AnalyzeResponse } from '../lib/api';
import { formatSafeNumber, safeNumber, safeText, warnMissingValue } from '../lib/utils';

interface ExecutionLogsProps {
  data: AnalyzeResponse;
}

const AGENT_COLORS: Record<string, string> = {
  a1_doc_intelligence: '#4D7FFF',
  a2_business_profiler: '#4D7FFF',
  a3_risk_scorer: '#F59E0B',
  a4_compliance_guard: '#E8475F',
  a5_negotiation: '#2ECC99',
  a6_audit_trail: '#A8B3C9',
  a7_lifecycle_monitor: '#A8B3C9',
  autonomy_loop: '#C9A96E',
};

export default function ExecutionLogs({ data }: ExecutionLogsProps) {
  const executionLogs = data.execution_logs ?? [];
  const handoffLog = data.handoff_log ?? [];
  const totalDuration = executionLogs.reduce((s, l, idx) => s + safeNumber(l?.duration_ms, 0, `execution_logs.${idx}.duration_ms`), 0);

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Agents Run', value: executionLogs.length, color: '#4D7FFF' },
          { label: 'Total Duration', value: `${formatSafeNumber(totalDuration / 1000, 2, 'execution_logs.total_duration_seconds')}s`, color: '#C9A96E' },
          { label: 'Audit Events', value: data.audit_event_count ?? 0, color: '#2ECC99' },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass-card p-4 text-center">
            <div className="font-mono font-black text-xl" style={{ color }}>{value}</div>
            <div className="text-xs mt-1" style={{ color: '#A8B3C9' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Handoff log */}
      {handoffLog.length > 0 && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-4 h-4" style={{ color: '#4D7FFF' }} />
            <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
              Agent Handoff Chain
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {handoffLog.map((entry, i) => {
              const parts = (entry ?? '').split(' → ');
              return (
                <div key={i} className="flex items-center gap-1">
                  {parts.map((part, j) => (
                    <div key={j} className="flex items-center gap-1">
                      <span
                        className="text-xs font-mono font-semibold px-2 py-1 rounded"
                        style={{ background: 'rgba(77,127,255,0.1)', color: '#4D7FFF', border: '1px solid rgba(77,127,255,0.2)' }}
                      >
                        {part}
                      </span>
                      {j < parts.length - 1 && (
                        <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: '#A8B3C9' }} />
                      )}
                    </div>
                  ))}
                  {i < handoffLog.length - 1 && (
                    <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Terminal className="w-4 h-4" style={{ color: '#2ECC99' }} />
          <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
            Execution Logs
          </h3>
          <div className="ml-auto flex gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: '#E8475F' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: '#F59E0B' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: '#2ECC99' }} />
          </div>
        </div>
        <div
          className="p-4 font-mono text-xs space-y-1.5 overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.5)', maxHeight: '400px' }}
        >
          <div className="text-xs mb-3" style={{ color: '#A8B3C9', opacity: 0.5 }}>
            ── ContractGuard Analysis Engine v2.0 ──────────────────
          </div>
              {executionLogs.map((log, i) => {
                const statusText = safeText(log?.status, 'error', `execution_logs.${i}.status`);
                const isSuccess = statusText === 'success';
                if (!['success', 'error', 'running'].includes(statusText)) {
                  warnMissingValue(`execution_logs.${i}.status`, statusText);
                }
                return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>{String(i + 1).padStart(2, '0')}</span>
                  {isSuccess
                    ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#2ECC99' }} />
                    : <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#E8475F' }} />
                  }
                  <span
                    className="font-semibold"
                    style={{ color: AGENT_COLORS[safeText(log?.agent, '', `execution_logs.${i}.agent`)] ?? '#A8B3C9', minWidth: '160px' }}
                  >
                    {safeText(log?.agent, '—', `execution_logs.${i}.agent`)}
                  </span>
                  <span style={{ color: isSuccess ? '#2ECC99' : '#E8475F' }}>
                    {statusText.toUpperCase()}
                  </span>
                  <Clock className="w-3 h-3 ml-auto flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} />
                  <span className="text-right" style={{ color: '#A8B3C9', minWidth: '60px' }}>
                    {formatSafeNumber(log?.duration_ms, 0, `execution_logs.${i}.duration_ms`)}ms
                  </span>
                </motion.div>
                );
              })}
          {handoffLog.length > 0 && (
            <>
              <div className="pt-2" style={{ color: 'rgba(255,255,255,0.1)' }}>────────────────────────────────────────────</div>
              {handoffLog.map((entry, i) => (
                <div key={`h-${i}`} className="flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  <span style={{ color: 'rgba(255,255,255,0.2)' }}>{String(executionLogs.length + i + 1).padStart(2, '0')}</span>
                  <ArrowRight className="w-3.5 h-3.5" style={{ color: '#C9A96E' }} />
                  <span style={{ color: '#C9A96E' }}>{safeText(entry, '—', `handoff_log.${i}`)}</span>
                </div>
              ))}
            </>
          )}
          <div className="pt-2" style={{ color: '#2ECC99', opacity: 0.6 }}>
            ── Analysis complete. {data.audit_event_count ?? 0} audit events recorded. ──
          </div>
        </div>
      </div>

      {/* Cost breakdown footer */}
      {executionLogs.length > 0 && (
        <div className="glass-card p-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
              Pipeline Cost Breakdown
            </h3>
          </div>
          <div className="font-mono text-xs space-y-1.5">
            <div style={{ color: 'rgba(255,255,255,0.15)' }}>────────────────────────────────────────────────────</div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#4D7FFF' }}>Deterministic stages (no Groq):</span>
              <span style={{ color: '#EAF1FF' }}>5 of 8</span>
              <span style={{ color: '#A8B3C9' }}>→  A1 · A2 · A4 · A6 · A7</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(77,127,255,0.1)', color: '#4D7FFF', border: '1px solid rgba(77,127,255,0.2)' }}>deterministic</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#F59E0B' }}>LLM stages:</span>
              <span style={{ color: '#EAF1FF' }}>up to 3 of 8</span>
              <span style={{ color: '#A8B3C9' }}>→  A3 Qwen3-32B · A5 Llama-70B · Autonomy Loop*</span>
            </div>
            <div className="text-left" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              * Autonomy loop runs only on critical-risk contracts (score ≥ 8.0 or MSME violation). Skipped for low/medium risk.
            </div>
            <div style={{ color: 'rgba(255,255,255,0.15)' }}>────────────────────────────────────────────────────</div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#A8B3C9' }}>Total API cost:</span>
              <span className="font-black" style={{ color: '#2ECC99' }}>~₹0.20 per analysis</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#A8B3C9' }}>vs. manual legal review:</span>
              <span style={{ color: '#E8475F' }}>₹35,000–₹62,000</span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ color: '#A8B3C9' }}>ROI on first contract:</span>
              <span className="font-black" style={{ color: '#C9A96E' }}>490×</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.15)' }}>────────────────────────────────────────────────────</div>
          </div>
        </div>
      )}
    </div>
  );
}
