import { useState } from 'react';
import { Sparkles, FileText, Send, Loader2, ChevronDown } from 'lucide-react';
import type { BusinessProfile, AnalyzeRequest } from '../lib/api';
import { DEMO_CONTRACT_TEXT, DEMO_BUSINESS_PROFILE } from '../lib/demoData';
import { formatINR } from '../lib/utils';

interface InputPanelProps {
  onAnalyze: (request: AnalyzeRequest) => void;
  isLoading: boolean;
  onDemoMode?: () => void;
  agentCount?: number;
}

const SECTORS = [
  { value: 'textiles', label: '🧵 Textiles' },
  { value: 'manufacturing', label: '🏭 Manufacturing' },
  { value: 'trading', label: '📦 Trading' },
  { value: 'IT', label: '💻 IT / Software' },
  { value: 'services', label: '🤝 Services' },
];

export default function InputPanel({ onAnalyze, isLoading, onDemoMode, agentCount = 8 }: InputPanelProps) {
  const [profile, setProfile] = useState<BusinessProfile>({
    sector: 'textiles',
    gross_margin_pct: 12,
    payment_cycle_days: 30,
    monthly_revenue: 500000,
    contract_value: 2000000,
  });
  const [contractText, setContractText] = useState('');

  const loadDemo = () => {
    setProfile(DEMO_BUSINESS_PROFILE);
    setContractText(DEMO_CONTRACT_TEXT);
  };

  const runDemo = () => {
    setProfile(DEMO_BUSINESS_PROFILE);
    setContractText(DEMO_CONTRACT_TEXT);
    if (onDemoMode) {
      onDemoMode();
    }
  };

  const handleSubmit = () => {
    if (!contractText.trim()) return;
    onAnalyze({ business_profile: profile, contract_text: contractText });
  };

  const updateProfile = (key: keyof BusinessProfile, value: string | number) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-5">
      {/* ── PHASE 1: HOOK MOMENT ── */}
      <div
        className="rounded-2xl p-5 text-center relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(201,169,110,0.12) 0%, rgba(201,169,110,0.03) 100%)',
          border: '1px solid rgba(201,169,110,0.28)',
          boxShadow: '0 0 40px rgba(201,169,110,0.06)',
        }}
      >
        <h1 className="text-lg lg:text-xl font-black tracking-tight mb-1" style={{ color: '#EAF1FF' }}>
          Same contract.{' '}
          <span style={{ color: '#C9A96E' }}>Different risk.</span>
        </h1>
        <p className="text-xs font-medium" style={{ color: '#A8B3C9' }}>
          Depending on your sector, margins, and payment cycle — the same clause can be safe or devastating.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#EAF1FF' }}>Contract Analysis</h2>
          <p className="text-xs mt-0.5" style={{ color: '#A8B3C9' }}>Paste your contract and set your business profile for AI-powered risk analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDemo}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: '#A8B3C9',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <FileText className="w-3.5 h-3.5" />
            Load Demo Text
          </button>
          <button
            onClick={runDemo}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(201,169,110,0.22), rgba(201,169,110,0.12))',
              color: '#C9A96E',
              border: '1px solid rgba(201,169,110,0.4)',
              boxShadow: '0 2px 12px rgba(201,169,110,0.15)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            ⚡ Run Demo
          </button>
        </div>
      </div>

      {/* Business Profile */}
      <div className="glass-card p-5">
        <h3 className="text-xs font-bold tracking-widest uppercase mb-4" style={{ color: '#C9A96E' }}>
          Business Profile
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Sector */}
          <div className="sm:col-span-2">
            <label className="label">Sector</label>
            <div className="relative">
              <select
                value={profile.sector}
                onChange={e => updateProfile('sector', e.target.value as BusinessProfile['sector'])}
                className="input-field appearance-none pr-8"
              >
                {SECTORS.map(s => (
                  <option key={s.value} value={s.value} style={{ background: '#0D1117' }}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: '#A8B3C9' }} />
            </div>
          </div>

          {/* Gross Margin */}
          <div>
            <label className="label">
              Gross Margin: <span className="font-mono" style={{ color: '#C9A96E' }}>{profile.gross_margin_pct}%</span>
            </label>
            <input
              type="range" min="0" max="100" step="0.5"
              value={profile.gross_margin_pct}
              onChange={e => updateProfile('gross_margin_pct', parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full outline-none cursor-pointer"
              style={{
                accentColor: '#C9A96E',
                background: `linear-gradient(to right, #C9A96E ${profile.gross_margin_pct}%, rgba(255,255,255,0.08) ${profile.gross_margin_pct}%)`,
              }}
            />
          </div>

          {/* Payment cycle */}
          <div>
            <label className="label">Payment Cycle (Days)</label>
            <input
              type="number" min="1" max="365"
              value={profile.payment_cycle_days}
              onChange={e => updateProfile('payment_cycle_days', parseInt(e.target.value) || 0)}
              className="input-field font-mono"
              placeholder="30"
            />
          </div>

          {/* Monthly Revenue */}
          <div>
            <label className="label">
              Monthly Revenue
              {profile.monthly_revenue > 0 && (
                <span className="ml-2 font-mono normal-case" style={{ color: '#C9A96E' }}>
                  {formatINR(profile.monthly_revenue)}
                </span>
              )}
            </label>
            <input
              type="number" min="0"
              value={profile.monthly_revenue}
              onChange={e => updateProfile('monthly_revenue', parseFloat(e.target.value) || 0)}
              className="input-field font-mono"
              placeholder="500000"
            />
          </div>

          {/* Contract Value */}
          <div>
            <label className="label">
              Contract Value
              {profile.contract_value > 0 && (
                <span className="ml-2 font-mono normal-case" style={{ color: '#C9A96E' }}>
                  {formatINR(profile.contract_value)}
                </span>
              )}
            </label>
            <input
              type="number" min="0"
              value={profile.contract_value}
              onChange={e => updateProfile('contract_value', parseFloat(e.target.value) || 0)}
              className="input-field font-mono"
              placeholder="2000000"
            />
          </div>
        </div>
      </div>

      {/* Contract Text */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4" style={{ color: '#4D7FFF' }} />
          <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#C9A96E' }}>
            Contract Text
          </h3>
          {contractText && (
            <span className="ml-auto text-xs font-mono" style={{ color: '#A8B3C9' }}>
              {contractText.length.toLocaleString()} chars
            </span>
          )}
        </div>
        <textarea
          value={contractText}
          onChange={e => setContractText(e.target.value)}
          placeholder="Paste your contract text here, or click 'Load Demo' to try with sample data..."
          rows={12}
          className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-all duration-200 font-mono"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#EAF1FF',
            lineHeight: '1.7',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'rgba(201,169,110,0.35)';
            e.target.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.08)';
          }}
          onBlur={e => {
            e.target.style.borderColor = 'rgba(255,255,255,0.06)';
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || !contractText.trim()}
        className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-base"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Analyzing with {agentCount} AI Agents...</span>
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            <span>Analyze Contract</span>
          </>
        )}
      </button>
    </div>
  );
}
