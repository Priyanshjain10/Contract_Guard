import { motion } from 'framer-motion';
import {
  FileSearch, BarChart3, Scale, Shield,
  MessageSquare, BookOpen, Clock, RefreshCw,
  CheckCircle, Loader2, Circle
} from 'lucide-react';
import { formatSafeNumber, safeNumber, safeText, warnMissingValue } from '../lib/utils';

type AgentStatus = 'idle' | 'running' | 'done' | 'error';

interface AgentNode {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const AGENTS: AgentNode[] = [
  { id: 'a1', name: 'Doc Intelligence', description: 'OCR & clause extraction', icon: <FileSearch className="w-5 h-5" />, color: '#4D7FFF' },
  { id: 'a2', name: 'Business Profiler', description: 'Sector & margin analysis', icon: <BarChart3 className="w-5 h-5" />, color: '#4D7FFF' },
  { id: 'a3', name: 'Risk Scorer', description: 'LLM risk quantification', icon: <Scale className="w-5 h-5" />, color: '#F59E0B' },
  { id: 'a4', name: 'Compliance Guard', description: 'MSME Act verification', icon: <Shield className="w-5 h-5" />, color: '#E8475F' },
  { id: 'a5', name: 'Negotiation', description: 'Clause rewrite engine', icon: <MessageSquare className="w-5 h-5" />, color: '#2ECC99' },
  { id: 'a6', name: 'Audit Trail', description: 'Immutable event log', icon: <BookOpen className="w-5 h-5" />, color: '#A8B3C9' },
  { id: 'a7', name: 'Lifecycle Monitor', description: 'Renewal & deadline alerts', icon: <Clock className="w-5 h-5" />, color: '#A8B3C9' },
  { id: 'loop', name: 'Autonomy Loop', description: 'Email → Simulate → Re-score → Decide', icon: <RefreshCw className="w-5 h-5" />, color: '#C9A96E' },
];

const AGENT_SEQUENCE = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'loop'];

// Map agent log names to AGENT_SEQUENCE indices for syncing with execution_logs
const AGENT_LOG_MAP: Record<string, number> = {
  a1_doc_intelligence: 0,
  a2_business_profiler: 1,
  a3_risk_scorer: 2,
  a4_compliance_guard: 3,
  a5_negotiation: 4,
  a6_audit_trail: 5,
  a7_lifecycle_monitor: 6,
  autonomy_loop: 7,
};

interface ExecutionLog {
  agent: string;
  status: 'success' | 'error' | 'running';
  duration_ms: number;
}

interface PipelineVisualizerProps {
  isRunning: boolean;
  isDone: boolean;
  activeAgentIndex?: number;
  executionLogs?: ExecutionLog[];
}

export default function PipelineVisualizer({ isRunning, isDone, activeAgentIndex = -1, executionLogs }: PipelineVisualizerProps) {
  // If we have real execution logs, derive status from them; otherwise use activeAgentIndex
  const getStatus = (agentId: string): AgentStatus => {
    if (executionLogs && executionLogs.length > 0) {
      // Find matching log entry
      const logEntry = executionLogs.find((l, idx) => {
        const logAgent = safeText(l?.agent, '', `pipeline.execution_logs.${idx}.agent`);
        const agentIdx = AGENT_LOG_MAP[logAgent];
        if (agentIdx == null) {
          warnMissingValue(`pipeline.execution_logs.${idx}.agent_map`, logAgent);
          return false;
        }
        return agentIdx === AGENT_SEQUENCE.indexOf(agentId);
      });
      if (logEntry) {
        if (logEntry.status === 'success') return 'done';
        if (logEntry.status === 'error') return 'error';
        if (logEntry.status === 'running') return 'running';
      }
    }
    const idx = AGENT_SEQUENCE.indexOf(agentId);
    if (!isRunning && !isDone) return 'idle';
    if (isDone) return 'done';
    if (idx < activeAgentIndex) return 'done';
    if (idx === activeAgentIndex) return 'running';
    return 'idle';
  };

  const doneCount = AGENT_SEQUENCE.filter(id => getStatus(id) === 'done').length;
  const progressPct = safeNumber((doneCount / AGENT_SEQUENCE.length) * 100, 0, 'pipeline.progress_pct');

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="w-4 h-4" style={{ color: '#C9A96E' }} />
        <h3 className="text-sm font-bold tracking-wider uppercase" style={{ color: '#C9A96E' }}>
          Agent Pipeline
        </h3>
        {(isRunning || isDone) && (
          <span className="text-[0.62rem] px-2 py-0.5 rounded-full font-semibold"
            style={{ color: '#A8B3C9', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {AGENTS.length}-agent system
          </span>
        )}
        {isRunning && (
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5"
            style={{ background: 'rgba(77,127,255,0.15)', color: '#4D7FFF', border: '1px solid rgba(77,127,255,0.3)' }}>
            <motion.span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: '#4D7FFF' }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            Processing
          </span>
        )}
        {isDone && (
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5"
            style={{ background: 'rgba(46,204,153,0.15)', color: '#2ECC99', border: '1px solid rgba(46,204,153,0.3)' }}>
            <CheckCircle className="w-3 h-3" />
            Complete
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(isRunning || isDone) && (
        <div className="mb-4">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #4D7FFF, #C9A96E, #2ECC99)' }}
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ color: '#A8B3C9', fontSize: '0.62rem' }}>
              {doneCount}/{AGENT_SEQUENCE.length} agents
            </span>
            <span className="font-mono" style={{ color: '#C9A96E', fontSize: '0.62rem' }}>
              {formatSafeNumber(progressPct, 0, 'pipeline.progress_pct')}%
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {/* Row 1: A1 → A2 */}
        <div className="grid grid-cols-2 gap-2">
          {AGENTS.slice(0, 2).map((agent) => (
            <AgentNodeCard key={agent.id} agent={agent} status={getStatus(agent.id)} />
          ))}
        </div>

        <ConnectorArrow label="parallel fork" />

        {/* Row 2: A3 ‖ A4 */}
        <div className="grid grid-cols-2 gap-2">
          {AGENTS.slice(2, 4).map((agent) => (
            <AgentNodeCard key={agent.id} agent={agent} status={getStatus(agent.id)} />
          ))}
        </div>

        <ConnectorArrow label="parallel fork" />

        {/* Row 3: A5 ‖ A6 ‖ A7 */}
        <div className="grid grid-cols-3 gap-2">
          {AGENTS.slice(4, 7).map((agent) => (
            <AgentNodeCard key={agent.id} agent={agent} status={getStatus(agent.id)} />
          ))}
        </div>

        <ConnectorArrow label="autonomy loop" />

        {/* Row 4: Loop */}
        <AgentNodeCard agent={AGENTS[7]} status={getStatus('loop')} fullWidth />
      </div>
    </div>
  );
}

function ConnectorArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <span className="text-xs px-2 py-0.5 rounded" style={{ color: '#A8B3C9', background: 'rgba(255,255,255,0.03)', fontSize: '0.65rem', letterSpacing: '0.08em' }}>
        ↓ {label}
      </span>
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
    </div>
  );
}

function AgentNodeCard({ agent, status, fullWidth = false }: { agent: AgentNode; status: AgentStatus; fullWidth?: boolean }) {
  const isActive = status === 'running';
  const isDone = status === 'done';
  const isError = status === 'error';

  return (
    <motion.div
      className="rounded-xl p-3 flex items-center gap-3 transition-all duration-300 relative overflow-hidden"
      style={{
        background: isActive
          ? `rgba(${hexToRgb(agent.color)}, 0.14)`
          : isDone
          ? 'rgba(46,204,153,0.06)'
          : isError
          ? 'rgba(232,71,95,0.08)'
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${
          isActive
            ? `${agent.color}55`
            : isDone
            ? 'rgba(46,204,153,0.2)'
            : isError
            ? 'rgba(232,71,95,0.2)'
            : 'rgba(255,255,255,0.06)'
        }`,
        gridColumn: fullWidth ? '1 / -1' : undefined,
        boxShadow: isActive ? `0 0 24px ${agent.color}33` : undefined,
      }}
      animate={isActive ? { scale: [1, 1.015, 1] } : { scale: 1 }}
      transition={isActive ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
    >
      {/* Glow sweep for active agent */}
      {isActive && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, transparent, ${agent.color}18, transparent)`,
          }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 relative"
        style={{
          background: isActive ? `${agent.color}28` : isDone ? 'rgba(46,204,153,0.1)' : 'rgba(255,255,255,0.05)',
          color: isActive ? agent.color : isDone ? '#2ECC99' : '#A8B3C9',
          boxShadow: isActive ? `0 0 12px ${agent.color}55` : undefined,
        }}
      >
        {agent.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate" style={{ color: isActive ? '#EAF1FF' : isDone ? '#EAF1FF' : '#A8B3C9' }}>
          {agent.name}
        </div>
        <div className="text-xs truncate opacity-70" style={{ color: '#A8B3C9', fontSize: '0.65rem' }}>
          {agent.description}
        </div>
      </div>
      <div className="flex-shrink-0">
        <StatusIconInner status={status} color={agent.color} />
      </div>
    </motion.div>
  );
}

function StatusIconInner({ status, color }: { status: AgentStatus; color: string }) {
  if (status === 'done') return (
    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}>
      <CheckCircle className="w-4 h-4" style={{ color: '#2ECC99' }} />
    </motion.div>
  );
  if (status === 'running') return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
      <Loader2 className="w-4 h-4" style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
    </motion.div>
  );
  return <Circle className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.15)' }} />;
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}
