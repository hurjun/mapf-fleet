'use client';

/** Scrolling sparklines of throughput, congestion, and elevator load. */

import { useSim } from '@/state/store';
import { Panel } from './ui';

function Spark({ values, color, max }: { values: number[]; color: string; max: number }) {
  const w = 240;
  const h = 28;
  const pad = 2;
  const n = values.length;

  let body = null;
  if (n >= 2) {
    const xFor = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
    const yFor = (v: number) => h - pad - (Math.min(v, max) / max) * (h - 2 * pad);
    const line = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
    const area = `${pad},${h - pad} ${line} ${xFor(n - 1)},${h - pad}`;
    body = (
      <>
        <polygon points={area} fill={color} fillOpacity={0.1} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.4} />
      </>
    );
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 w-full" preserveAspectRatio="none">
      {body}
    </svg>
  );
}

function Trend({
  label,
  value,
  color,
  values,
  max,
}: {
  label: string;
  value: string;
  color: string;
  values: number[];
  max: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-white/55">{label}</span>
        <span className="font-mono tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <Spark values={values} color={color} max={max} />
    </div>
  );
}

export function TimeSeriesPanel() {
  const history = useSim((s) => s.history);
  const last = history[history.length - 1];

  const throughput = history.map((s) => s.throughput);
  const congestion = history.map((s) => s.congestion);
  const elevator = history.map((s) => s.elevator);
  const tMax = Math.max(1, ...throughput);

  return (
    <Panel title="Trends">
      <div className="space-y-2.5">
        <Trend
          label="Throughput"
          value={`${last ? Math.round(last.throughput) : 0}/min`}
          color="#5eead4"
          values={throughput}
          max={tMax}
        />
        <Trend
          label="Congestion"
          value={`${last ? Math.round(last.congestion * 100) : 0}%`}
          color="#fbbf24"
          values={congestion}
          max={1}
        />
        <Trend
          label="Elevator load"
          value={`${last ? Math.round(last.elevator * 100) : 0}%`}
          color="#a78bfa"
          values={elevator}
          max={1}
        />
      </div>
    </Panel>
  );
}
