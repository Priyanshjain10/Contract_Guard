# ContractGuard — React Frontend

## What This Is
5-page interactive dashboard for ContractGuard's 8-stage autonomous
contract analysis pipeline. Judges: click "Run Demo" to see the full
Sunita Fabrics / Net-90 / ₹26,630 violation scenario immediately.

## Pages
| Page | Purpose |
|------|---------|
| Analyze | Input contract text + MSME business profile → triggers pipeline |
| Results | Risk scores, MSME Act violations, negotiation rewrites, SIGN/DO_NOT_SIGN decision |
| Exec Logs | Real-time agent execution log with per-agent timestamps and cost breakdown |
| System | API health check and connection status |
| How It Works | Visual pipeline walkthrough + score comparison demo |

## Quick Start
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
# Requires API running at http://localhost:8000
# (run from repo root: python -m uvicorn contractguard.api:app --reload)
```

## Demo Mode (no backend needed)
Click **"Run Demo"** on the Analyze page. Uses pre-built DEMO_RESPONSE from
src/lib/demoData.ts showing the full Sunita Fabrics scenario:
Net-90 clause → score 9.0 → MSME Act §15 violation → ₹26,630 interest → DO_NOT_SIGN
→ autonomy loop → counterparty accepts Net-45 → re-score 5.8 → SIGN_WITH_CAUTION

## Key Files
```
src/
  App.tsx                     Main app + navigation + pipeline animation
  components/
    InputPanel.tsx            Contract text + business profile form
    ResultsDashboard.tsx      Full results: risk gauge, clause cards, decision
    ExecutionLogs.tsx         Agent activity console with cost breakdown
    PipelineVisualizer.tsx    Animated pipeline diagram (8 stages)
    ClauseCard.tsx            Individual clause risk card
    RiskGauge.tsx             Animated risk score gauge
  lib/
    api.ts                    API client: analyzeContract(), checkHealth()
    demoData.ts               Pre-built demo scenario + score comparison data
    utils.ts                  formatINR() and utility functions
```

## Tech Stack
React 19 · TypeScript 5.9 · Vite 8 · TailwindCSS 3 · Framer Motion 12

## Build
```bash
cd frontend
npm run build    # TypeScript compile (tsc -b) + Vite bundle → frontend/dist/
npm run lint     # ESLint check
npm run preview  # Preview production build at localhost:4173
```
