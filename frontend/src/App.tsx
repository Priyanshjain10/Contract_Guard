import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, BarChart3, Terminal, Activity,
  ShieldCheck, AlertCircle, CheckCircle2, Menu, X, Sparkles,
  Brain, Cpu, Shield, Scale, MessageSquare, BookOpen, Clock, RefreshCw, FileSearch
} from 'lucide-react';
import type { AnalyzeRequest, AnalyzeResponse } from './lib/api';
import { analyzeContract, checkHealth } from './lib/api';
import { DEMO_RESPONSE, DEMO_COMPARISON } from './lib/demoData';
import { formatSafeNumber, safeNumber } from './lib/utils';
import InputPanel from './components/InputPanel';
import PipelineVisualizer from './components/PipelineVisualizer';
import ResultsDashboard from './components/ResultsDashboard';
import ExecutionLogs from './components/ExecutionLogs';
import ErrorBoundary from './components/ErrorBoundary';

type Page = 'analyze' | 'results' | 'logs' | 'health' | 'howItWorks';

const NAV_ITEMS: { id: Page; icon: React.ReactNode; label: string }[] = [
  { id: 'analyze', icon: <FileText className="w-4 h-4" />, label: 'Analyze' },
  { id: 'results', icon: <BarChart3 className="w-4 h-4" />, label: 'Results' },
  { id: 'logs', icon: <Terminal className="w-4 h-4" />, label: 'Exec Logs' },
  { id: 'health', icon: <Activity className="w-4 h-4" />, label: 'System' },
  { id: 'howItWorks', icon: <Brain className="w-4 h-4" />, label: 'How It Works' },
];

const AGENT_BASE_DURATIONS = [340, 460, 740, 620, 980, 360, 420, 860];
const AGENT_COUNT = AGENT_BASE_DURATIONS.length; // derived — keep in sync with AGENTS array in PipelineVisualizer
const LOADING_MESSAGES = [
  'Parsing structure and clauses...',
  'Profiling your business context...',
  'Scoring legal and business risk...',
  'Checking Indian compliance frameworks...',
  'Drafting negotiation-safe alternatives...',
  'Building audit trail and lifecycle checks...',
  'Consolidating final decision...',
  'Finalizing decision confidence...',
];

export default function App() {
  const [page, setPage] = useState<Page>('analyze');
  const [isLoading, setIsLoading] = useState(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState(-1);
  const [results, setResults] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [resultsVisible, setResultsVisible] = useState(false);
  const animTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const messageIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsVisibleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    checkHealth()
      .then(() => setHealthStatus('ok'))
      .catch(() => setHealthStatus('error'));
  }, []);

  const stopPipelineAnimation = useCallback(() => {
    animTimeoutsRef.current.forEach(t => clearTimeout(t));
    animTimeoutsRef.current = [];
  }, []);

  const stopLoadingMessageAnimation = useCallback(() => {
    if (messageIntervalRef.current) {
      clearInterval(messageIntervalRef.current);
      messageIntervalRef.current = null;
    }
  }, []);

  const startLoadingMessageAnimation = useCallback(() => {
    stopLoadingMessageAnimation();
    setLoadingMessageIndex(0);
    messageIntervalRef.current = setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 1000);
  }, [stopLoadingMessageAnimation]);

  const startPipelineAnimation = useCallback(() => {
    stopPipelineAnimation();
    setActiveAgentIndex(0);
    let cumulativeDelay = 0;
    AGENT_BASE_DURATIONS.forEach((baseDuration, index) => {
      const jitter = Math.floor(Math.random() * 220) - 110;
      const stepDuration = Math.max(260, baseDuration + jitter);
      cumulativeDelay += stepDuration;
      const timeout = setTimeout(() => {
        setActiveAgentIndex(index + 1);
      }, cumulativeDelay);
      animTimeoutsRef.current.push(timeout);
    });
    return cumulativeDelay;
  }, [stopPipelineAnimation]);

  // Phase 7: Demo Mode — instantly show demo results with animated pipeline
  const handleDemoMode = useCallback(() => {
    if (isRunningRef.current) return; // prevent double execution
    isRunningRef.current = true;
    if (resultsVisibleTimerRef.current) {
      clearTimeout(resultsVisibleTimerRef.current);
      resultsVisibleTimerRef.current = null;
    }
    setIsLoading(true);
    setError(null);
    setResults(null);
    setResultsVisible(false);
    setActiveAgentIndex(-1);
    startLoadingMessageAnimation();
    const totalPipelineDuration = startPipelineAnimation();

    // Simulate pipeline completion then show demo results
    const completionId = setTimeout(() => {
      stopPipelineAnimation();
      stopLoadingMessageAnimation();
      setActiveAgentIndex(AGENT_COUNT);
      setResults(DEMO_RESPONSE);
      setIsLoading(false);
      isRunningRef.current = false;
      setPage('results');
      setResultsVisible(false);
      resultsVisibleTimerRef.current = setTimeout(() => {
        setResultsVisible(true);
        resultsVisibleTimerRef.current = null;
      }, 120);
    }, totalPipelineDuration + 350);
    animTimeoutsRef.current.push(completionId);
  }, [startPipelineAnimation, startLoadingMessageAnimation, stopLoadingMessageAnimation, stopPipelineAnimation]);

  const handleAnalyze = useCallback(async (request: AnalyzeRequest) => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    if (resultsVisibleTimerRef.current) {
      clearTimeout(resultsVisibleTimerRef.current);
      resultsVisibleTimerRef.current = null;
    }
    setIsLoading(true);
    setError(null);
    setResults(null);
    setResultsVisible(false);
    setActiveAgentIndex(-1);
    startLoadingMessageAnimation();
    startPipelineAnimation();

    try {
      const data = await analyzeContract(request, signal);
      if (signal.aborted) return; // stale response — discard
      stopPipelineAnimation();
      stopLoadingMessageAnimation();
      setActiveAgentIndex(AGENT_COUNT); // all done
      setResults(data);
      setPage('results');
      resultsVisibleTimerRef.current = setTimeout(() => {
        setResultsVisible(true);
        resultsVisibleTimerRef.current = null;
      }, 120);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return; // intentional cancel
      stopPipelineAnimation();
      stopLoadingMessageAnimation();
      setActiveAgentIndex(-1);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      // Offer demo mode if API is down
      const networkErrorTokens = ['fetch', 'Failed', 'NetworkError', '502', '503', '504'];
      if (networkErrorTokens.some(token => msg.includes(token))) {
        setError('API unavailable — showing demo results');
        setResults(DEMO_RESPONSE);
        setActiveAgentIndex(AGENT_COUNT);
        setPage('results');
        resultsVisibleTimerRef.current = setTimeout(() => {
          setResultsVisible(true);
          resultsVisibleTimerRef.current = null;
        }, 120);
      } else {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [startLoadingMessageAnimation, startPipelineAnimation, stopLoadingMessageAnimation, stopPipelineAnimation]);

  useEffect(() => () => {
    stopPipelineAnimation();
    stopLoadingMessageAnimation();
    if (resultsVisibleTimerRef.current) clearTimeout(resultsVisibleTimerRef.current);
    if (abortControllerRef.current) abortControllerRef.current.abort();
  }, [stopLoadingMessageAnimation, stopPipelineAnimation]);

  const isDone = !isLoading && (results !== null || activeAgentIndex === AGENT_COUNT);

  return (
    <ErrorBoundary>
      <div className="min-h-screen" style={{ background: '#050709' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{
          width: '220px',
          background: 'rgba(5,7,9,0.95)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Logo */}
        <div className="p-5 flex items-center gap-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #C9A96E, #8B6B3A)' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-black text-sm tracking-tight" style={{ color: '#EAF1FF' }}>ContractGuard</div>
            <div className="text-xs" style={{ color: '#A8B3C9' }}>MSME Protection</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" style={{ color: '#A8B3C9' }} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = page === item.id;
            const isDisabled = (item.id === 'results' || item.id === 'logs') && results === null;
            return (
              <button
                key={item.id}
                onClick={() => { if (!isDisabled) { setPage(item.id); setSidebarOpen(false); } }}
                disabled={isDisabled}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  color: isDisabled ? 'rgba(168,179,201,0.35)' : isActive ? '#EAF1FF' : '#A8B3C9',
                  background: isActive ? 'rgba(201,169,110,0.12)' : 'transparent',
                  border: isActive ? '1px solid rgba(201,169,110,0.2)' : '1px solid transparent',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                <span style={{ color: isActive ? '#C9A96E' : isDisabled ? 'rgba(168,179,201,0.3)' : '#A8B3C9' }}>
                  {item.icon}
                </span>
                {item.label}
                {item.id === 'results' && results && (
                  <span className="ml-auto w-2 h-2 rounded-full" style={{ background: '#2ECC99' }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Health status */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 text-xs">
            {healthStatus === 'ok' ? (
              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#2ECC99' }} />
            ) : healthStatus === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5" style={{ color: '#E8475F' }} />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full animate-pulse" style={{ background: '#F59E0B' }} />
            )}
            <span style={{ color: '#A8B3C9' }}>
              API {healthStatus === 'checking' ? 'checking\u2026' : healthStatus === 'ok' ? 'online' : 'offline'}
            </span>
          </div>
          {results && (
            <div className="mt-2 text-xs font-mono truncate" style={{ color: '#C9A96E', opacity: 0.7 }}>
              {results.analysis_id}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-[220px] min-h-screen flex flex-col">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
          style={{
            background: 'rgba(5,7,9,0.8)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" style={{ color: '#A8B3C9' }} />
          </button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 lg:hidden" style={{ color: '#C9A96E' }} />
            <span className="font-bold text-sm" style={{ color: '#EAF1FF' }}>
              {NAV_ITEMS.find(n => n.id === page)?.label}
            </span>
          </div>
          {error && (
            <div className="ml-4 px-3 py-1 rounded-full text-xs flex items-center gap-1.5"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}>
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
          {/* Demo Mode button */}
          {!isLoading && (
            <button
              onClick={handleDemoMode}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: 'rgba(201,169,110,0.12)',
                color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.3)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Demo Mode
            </button>
          )}
          {results && (
            <div className="ml-auto px-3 py-1 rounded-full text-xs font-mono flex items-center gap-1.5"
              style={{ background: 'rgba(201,169,110,0.1)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.2)' }}>
              {results.analysis_id}
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          <AnimatePresence mode="wait">
            {page === 'analyze' && (
              <motion.div
                key="analyze"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* Hero statement */}
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="rounded-xl px-6 py-5 text-center"
                  style={{ background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.2)' }}
                >
                  <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#C9A96E' }}>
                    ET AI Hackathon 2026 · Track 5 · Domain-Specialized AI Agents
                  </div>
                  <div className="text-2xl font-black mb-2" style={{ color: '#EAF1FF' }}>
                    Same clause. Different score.
                  </div>
                  <p className="text-sm max-w-2xl mx-auto mb-2" style={{ color: '#A8B3C9' }}>
                    Net-90 payment terms score{' '}
                    <span className="font-bold" style={{ color: '#E8475F' }}>{DEMO_COMPARISON.profiles[0].score}</span>
                    {' '}for a textile MSME with {DEMO_COMPARISON.profiles[0].margin} margins — and{' '}
                    <span className="font-bold" style={{ color: '#2ECC99' }}>{DEMO_COMPARISON.profiles[1].score}</span>
                    {' '}for an IT firm with {DEMO_COMPARISON.profiles[1].margin} margins. ContractGuard scores by business context, not just legal text.
                  </p>
                  <div className="text-xs" style={{ color: 'rgba(168,179,201,0.6)' }}>
                    Upload a contract or use the demo below →
                  </div>
                </motion.div>
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div className="xl:col-span-3">
                  <InputPanel onAnalyze={handleAnalyze} isLoading={isLoading} onDemoMode={handleDemoMode} agentCount={AGENT_COUNT} />
                </div>
                <div className="xl:col-span-2">
                  {isLoading && (
                    <div className="space-y-3 mb-3">
                      <div
                        className="rounded-xl px-4 py-3 text-xs flex items-center gap-2"
                        style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.25)', color: '#C9A96E' }}
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing contract with {AGENT_COUNT}-agent system... {LOADING_MESSAGES[loadingMessageIndex]}</span>
                      </div>
                      <div className="glass-card p-4 space-y-2.5">
                        <div className="h-2.5 rounded shimmer" style={{ width: '56%', background: 'rgba(255,255,255,0.08)' }} />
                        <div className="h-2.5 rounded shimmer" style={{ width: '74%', background: 'rgba(255,255,255,0.06)' }} />
                        <div className="h-2.5 rounded shimmer" style={{ width: '41%', background: 'rgba(255,255,255,0.08)' }} />
                      </div>
                    </div>
                  )}
                  <PipelineVisualizer
                    isRunning={isLoading}
                    isDone={isDone}
                    activeAgentIndex={activeAgentIndex}
                    executionLogs={results?.execution_logs}
                  />
                </div>
                </div>
              </motion.div>
            )}

            {page === 'results' && results && (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: resultsVisible ? 1 : 0, y: resultsVisible ? 0 : 10 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <ResultsDashboard data={results} />
              </motion.div>
            )}

            {page === 'logs' && results && (
              <motion.div
                key="logs"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <ExecutionLogs data={results} />
              </motion.div>
            )}

            {page === 'health' && (
              <motion.div
                key="health"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <HealthPage healthStatus={healthStatus} onRecheck={() => {
                  setHealthStatus('checking');
                  checkHealth().then(() => setHealthStatus('ok')).catch(() => setHealthStatus('error'));
                }} />
              </motion.div>
            )}

            {page === 'howItWorks' && (
              <motion.div
                key="howItWorks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <HowItWorksPage />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
    </ErrorBoundary>
  );
}

function HealthPage({ healthStatus, onRecheck }: { healthStatus: 'checking' | 'ok' | 'error'; onRecheck: () => void }) {
  const services = [
    { name: 'API Server', endpoint: 'GET /health', status: healthStatus },
    { name: 'Doc Intelligence (A1)', endpoint: 'POST /analyze', status: healthStatus },
    { name: 'Risk Scorer (A3)', endpoint: 'LLM \u00b7 Groq', status: healthStatus },
    { name: 'Compliance Guard (A4)', endpoint: 'MSME Act DB', status: healthStatus },
    { name: 'Negotiation Engine (A5)', endpoint: 'LLM \u00b7 Groq', status: healthStatus },
    { name: 'Audit Trail (A6)', endpoint: 'Event Store', status: healthStatus },
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: '#EAF1FF' }}>System Status</h2>
        <button
          onClick={onRecheck}
          className="text-xs px-4 py-2 rounded-xl font-semibold transition-all"
          style={{ background: 'rgba(77,127,255,0.1)', color: '#4D7FFF', border: '1px solid rgba(77,127,255,0.25)' }}
        >
          Re-check
        </button>
      </div>
      <div className="glass-card divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {services.map((svc, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <div className="text-sm font-semibold" style={{ color: '#EAF1FF' }}>{svc.name}</div>
              <div className="text-xs mt-0.5 font-mono" style={{ color: '#A8B3C9' }}>{svc.endpoint}</div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: svc.status === 'ok' ? '#2ECC99' : svc.status === 'error' ? '#E8475F' : '#F59E0B',
                  boxShadow: `0 0 6px ${svc.status === 'ok' ? '#2ECC99' : svc.status === 'error' ? '#E8475F' : '#F59E0B'}`,
                  animation: svc.status === 'checking' ? 'pulse 1.5s infinite' : undefined,
                }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: svc.status === 'ok' ? '#2ECC99' : svc.status === 'error' ? '#E8475F' : '#F59E0B' }}
              >
                {svc.status === 'ok' ? 'Online' : svc.status === 'error' ? 'Offline' : 'Checking'}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="glass-card p-5">
        <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#C9A96E' }}>About</h3>
        <div className="space-y-2 text-sm" style={{ color: '#A8B3C9' }}>
          <p>ContractGuard is an {AGENT_COUNT}-agent AI system designed to protect Indian MSMEs from unfair contract terms and statutory violations.</p>
          <p className="text-xs">
            <span style={{ color: '#EAF1FF' }}>Compliance: </span>
            MSME Development Act 2006 \u00b7 Indian Contract Act 1872 \u00b7 Competition Act 2002
          </p>
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { label: 'API Version', value: 'v2.0' },
              { label: 'Model', value: 'Groq LLaMA-3' },
              { label: 'Jurisdiction', value: 'India' },
              { label: 'Build', value: 'Production' },
            ].map(({ label, value }) => (
              <div key={label} className="text-xs">
                <span style={{ color: '#A8B3C9' }}>{label}: </span>
                <span className="font-mono font-semibold" style={{ color: '#EAF1FF' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Phase 8: System Credibility — How It Works Page
function HowItWorksPage() {
  const agents = [
    {
      id: 'A1', name: 'Doc Intelligence', type: 'deterministic', color: '#4D7FFF',
      icon: <FileSearch className="w-5 h-5" />,
      description: 'OCR pipeline extracts and classifies contract clauses. Identifies payment terms, penalties, exclusivity, and renewal clauses with confidence scoring.',
    },
    {
      id: 'A2', name: 'Business Profiler', type: 'deterministic', color: '#4D7FFF',
      icon: <Cpu className="w-5 h-5" />,
      description: 'Maps sector-specific risk weights and computes business impact multipliers based on gross margin, payment cycle, and contract value.',
    },
    {
      id: 'A3', name: 'Risk Scorer', type: 'llm', color: '#F59E0B',
      icon: <Scale className="w-5 h-5" />,
      description: 'LLM (Groq LLaMA-3) quantifies legal risk on a 0–10 scale using legal knowledge base similarity and business impact multipliers.',
    },
    {
      id: 'A4', name: 'Compliance Guard', type: 'deterministic', color: '#E8475F',
      icon: <Shield className="w-5 h-5" />,
      description: 'Rules-based engine verifies compliance against MSME Development Act 2006, Indian Contract Act 1872, and Competition Act 2002. Computes interest liability.',
    },
    {
      id: 'A5', name: 'Negotiation Engine', type: 'llm', color: '#2ECC99',
      icon: <MessageSquare className="w-5 h-5" />,
      description: 'LLM generates clause-level rewrites that protect MSME interests while remaining commercially viable. Estimates risk reduction per rewrite.',
    },
    {
      id: 'A6', name: 'Audit Trail', type: 'deterministic', color: '#A8B3C9',
      icon: <BookOpen className="w-5 h-5" />,
      description: 'Immutable event log records every agent action, decision, and output. Provides full traceability for legal and compliance purposes.',
    },
    {
      id: 'A7', name: 'Lifecycle Monitor', type: 'deterministic', color: '#A8B3C9',
      icon: <Clock className="w-5 h-5" />,
      description: 'Tracks contract renewal deadlines, payment milestones, and critical dates. Generates alerts for time-sensitive obligations.',
    },
    {
      id: 'LOOP', name: 'Autonomy Loop', type: 'llm', color: '#C9A96E',
      icon: <RefreshCw className="w-5 h-5" />,
      description: 'Orchestrates the full negotiation cycle: generates email draft → simulates counterparty response → re-scores risk → makes final sign/reject decision.',
    },
  ];

  const stages = [
    { label: 'Extract', desc: 'OCR + Clause Classification', color: '#4D7FFF' },
    { label: 'Profile', desc: 'Business Risk Mapping', color: '#4D7FFF' },
    { label: 'Score', desc: 'LLM Risk Quantification', color: '#F59E0B' },
    { label: 'Verify', desc: 'Statutory Compliance Check', color: '#E8475F' },
    { label: 'Negotiate', desc: 'AI Clause Rewriting', color: '#2ECC99' },
    { label: 'Simulate', desc: 'Counterparty Modelling', color: '#C9A96E' },
    { label: 'Decide', desc: 'Final Sign / Reject', color: '#2ECC99' },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black mb-1" style={{ color: '#EAF1FF' }}>How ContractGuard Works</h2>
        <p className="text-sm" style={{ color: '#A8B3C9' }}>
          An {AGENT_COUNT}-agent AI system combining deterministic rules and LLM intelligence to protect Indian MSMEs.
        </p>
      </div>

      {/* Pipeline stages */}
      <div className="glass-card p-5">
        <h3 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#C9A96E' }}>Analysis Pipeline</h3>
        <div className="flex flex-wrap gap-2 items-center">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <div
                  className="px-3 py-2 rounded-xl text-center min-w-[80px]"
                  style={{ background: `${stage.color}18`, border: `1px solid ${stage.color}44` }}
                >
                  <div className="text-xs font-black" style={{ color: stage.color }}>{stage.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#A8B3C9', fontSize: '0.6rem' }}>{stage.desc}</div>
                </div>
              </div>
              {i < stages.length - 1 && (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Score Comparison — Core IP */}
      <div className="glass-card p-5">
        <h3 className="text-xs font-bold tracking-widest uppercase mb-1" style={{ color: '#C9A96E' }}>
          The Core IP: Context-Aware Scoring
        </h3>
        <p className="text-xs mb-4" style={{ color: '#A8B3C9' }}>
          The same clause. The same legal text. Completely different risk profiles.
        </p>
        {/* Shared clause */}
        <div
          className="rounded-xl p-4 mb-4 font-mono text-xs leading-relaxed"
          style={{ background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', color: '#EAF1FF' }}
        >
          {DEMO_COMPARISON.clause}
        </div>
        {/* Side-by-side cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {DEMO_COMPARISON.profiles.map((profile, i) => {
            const isRed = profile.color === 'red';
            const accentColor = isRed ? '#E8475F' : '#2ECC99';
            return (
              <motion.div
                key={profile.name}
                className="rounded-xl p-5"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                style={{ background: `${accentColor}0d`, border: `1px solid ${accentColor}44` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-black" style={{ color: '#EAF1FF' }}>{profile.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: '#A8B3C9' }}>{profile.sector}</div>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-lg"
                    style={{ background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}55` }}
                  >
                    {profile.verdictLabel}
                  </span>
                </div>
                {/* Score — large and prominent */}
                <div className="flex items-baseline gap-2 mb-3">
                    <span className="font-black" style={{ fontSize: '3rem', lineHeight: 1, color: accentColor }}>
                     {formatSafeNumber(profile.score, 1, `demo_comparison.profiles.${profile.name}.score`)}
                    </span>
                  <span className="text-sm" style={{ color: '#A8B3C9' }}>/10</span>
                </div>
                {/* Business context */}
                <div className="space-y-1 mb-3">
                  {[
                    { label: 'Gross Margin', value: profile.margin },
                    { label: 'Payment Cycle', value: profile.paymentCycle },
                    { label: 'Monthly Revenue', value: profile.monthlyRevenue },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span style={{ color: '#A8B3C9' }}>{label}</span>
                      <span className="font-semibold font-mono" style={{ color: '#EAF1FF' }}>{value}</span>
                    </div>
                  ))}
                  {safeNumber(profile.interestLiability, 0, `demo_comparison.profiles.${profile.name}.interest_liability`) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span style={{ color: '#A8B3C9' }}>Interest Liability</span>
                      <span className="font-bold font-mono" style={{ color: '#E8475F' }}>
                        ₹{Math.round(safeNumber(profile.interestLiability, 0, `demo_comparison.profiles.${profile.name}.interest_liability`)).toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: accentColor, opacity: 0.85 }}>
                  {profile.reason}
                </p>
              </motion.div>
            );
          })}
        </div>
        {/* Tagline */}
        <p className="text-center text-sm font-semibold" style={{ color: '#C9A96E' }}>
          {DEMO_COMPARISON.tagline}
        </p>
      </div>

      {/* Agent cards */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
            Agent Details
          </h3>
          <div className="flex gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(201,169,110,0.12)', color: '#C9A96E', border: '1px solid rgba(201,169,110,0.25)' }}>
              <Brain className="w-3 h-3" /> LLM
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(77,127,255,0.12)', color: '#4D7FFF', border: '1px solid rgba(77,127,255,0.25)' }}>
              <Cpu className="w-3 h-3" /> Deterministic
            </span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              className="glass-card p-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${agent.color}18`, color: agent.color, border: `1px solid ${agent.color}33` }}
                >
                  {agent.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono font-bold" style={{ color: '#A8B3C9' }}>{agent.id}</span>
                    <span className="text-sm font-semibold" style={{ color: '#EAF1FF' }}>{agent.name}</span>
                    <span
                      className="ml-auto text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: agent.type === 'llm' ? 'rgba(201,169,110,0.15)' : 'rgba(77,127,255,0.12)',
                        color: agent.type === 'llm' ? '#C9A96E' : '#4D7FFF',
                        border: `1px solid ${agent.type === 'llm' ? 'rgba(201,169,110,0.3)' : 'rgba(77,127,255,0.25)'}`,
                        fontSize: '0.65rem',
                      }}
                    >
                      {agent.type === 'llm' ? '🧠 LLM' : '⚙️ Rules'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#A8B3C9' }}>{agent.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Compliance frameworks */}
      <div className="glass-card p-5">
        <h3 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#C9A96E' }}>Statutory Frameworks</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'MSME Development Act 2006', key: 'Section 15 — 45-day payment limit\nSection 16 — Compound interest on delays\nSection 17 — Recovery mechanisms', color: '#E8475F' },
            { name: 'Indian Contract Act 1872', key: 'Section 74 — Liquidated damages\nSection 73 — Compensation principles\nSection 27 — Restraint of trade', color: '#F59E0B' },
            { name: 'Competition Act 2002', key: 'Section 3 — Anti-competitive agreements\nSection 4 — Abuse of dominance\nSection 3(4) — Exclusive dealing', color: '#4D7FFF' },
          ].map((law) => (
            <div
              key={law.name}
              className="rounded-xl p-4"
              style={{ background: `${law.color}0a`, border: `1px solid ${law.color}33` }}
            >
              <div className="text-xs font-bold mb-2" style={{ color: law.color }}>{law.name}</div>
              <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: '#A8B3C9', fontFamily: 'inherit' }}>{law.key}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
