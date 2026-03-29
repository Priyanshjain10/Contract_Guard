import { useEffect, useRef } from 'react';
import { getRiskColor, getRiskLabel } from '../lib/utils';

interface RiskGaugeProps {
  score: number;
  size?: number;
  animate?: boolean;
}

export default function RiskGauge({ score, size = 200, animate = true }: RiskGaugeProps) {
  const pathRef = useRef<SVGCircleElement>(null);
  const clampedScore = Math.min(10, Math.max(0, score));
  const color = getRiskColor(clampedScore);
  const label = getRiskLabel(clampedScore);

  const radius = (size - 24) / 2;
  const circumference = 2 * Math.PI * radius;
  // Only draw 270 degrees (leave gap at bottom)
  const arcLength = circumference * 0.75;
  const offset = arcLength - (clampedScore / 10) * arcLength;
  const cx = size / 2;
  const cy = size / 2;

  useEffect(() => {
    if (!animate || !pathRef.current) return;
    pathRef.current.style.strokeDashoffset = String(arcLength);
    const t = setTimeout(() => {
      if (pathRef.current) {
        pathRef.current.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.34,1.56,0.64,1)';
        pathRef.current.style.strokeDashoffset = String(offset);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [score, animate, arcLength, offset]);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="12"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <circle
          ref={pathRef}
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={animate ? arcLength : offset}
          strokeLinecap="round"
          style={{
            filter: clampedScore >= 7 ? `drop-shadow(0 0 8px ${color})` : undefined,
          }}
        />
        {/* Glow dot at end */}
        <circle
          cx={cx} cy={cy - radius} r="6"
          fill={color}
          style={{ filter: `drop-shadow(0 0 4px ${color})` }}
        />
        {/* Score text (counter-rotated) */}
        <text
          x={cx} y={cy - 8}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            transform: `rotate(-135deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            fill: color,
            fontSize: size * 0.22,
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 700,
          }}
        >
          {clampedScore.toFixed(1)}
        </text>
        <text
          x={cx} y={cy + size * 0.12}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            transform: `rotate(-135deg)`,
            transformOrigin: `${cx}px ${cy}px`,
            fill: '#A8B3C9',
            fontSize: size * 0.075,
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.1em',
          }}
        >
          / 10
        </text>
      </svg>
      <div
        className="text-xs font-bold tracking-widest px-3 py-1 rounded-full"
        style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}
      >
        {label} RISK
      </div>
    </div>
  );
}
