'use client';

/**
 * Surfaces the analytical fleet-size optimizer: the recommended deployment, the
 * binding bottleneck, and the predicted throughput-vs-fleet curve. A marker
 * shows where the current fleet sits on that curve, and "Apply" snaps the fleet
 * to the recommendation.
 */

import { useSim } from '@/state/store';
import { Bottleneck, ThroughputPoint } from '@/sim/optimize';
import { Button, Panel } from './ui';

const BOTTLENECK_LABEL: Record<Bottleneck, string> = {
  elevators: 'elevator capacity',
  congestion: 'floor congestion',
  balanced: 'fleet size',
};

export function OptimizerCard() {
  const optimizer = useSim((s) => s.optimizer);
  const robotCount = useSim((s) => s.robotCount);
  const applyRecommended = useSim((s) => s.applyRecommended);

  return (
    <Panel title="Fleet optimizer">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-white/40">Recommended fleet</div>
          <div className="font-mono text-2xl tabular-nums text-accent">
            {optimizer.recommended}
            <span className="ml-1 text-sm text-white/45">robots</span>
          </div>
        </div>
        <Button variant="primary" onClick={applyRecommended}>
          Apply
        </Button>
      </div>

      <Curve curve={optimizer.curve} recommended={optimizer.recommended} current={robotCount} />

      <p className="mt-2 text-[11px] leading-snug text-white/55">
        Peak ≈ <span className="font-mono text-white/80">{optimizer.maxThroughput.toFixed(0)}</span>{' '}
        deliveries/min, limited by{' '}
        <span className="text-accent">{BOTTLENECK_LABEL[optimizer.bottleneck]}</span>. Beyond the
        recommendation, extra robots mostly add congestion.
      </p>
    </Panel>
  );
}

function Curve({
  curve,
  recommended,
  current,
}: {
  curve: ThroughputPoint[];
  recommended: number;
  current: number;
}) {
  const w = 280;
  const h = 64;
  const pad = 5;
  const n = curve.length;
  const max = Math.max(1, ...curve.map((p) => p.throughput));

  const xFor = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - 2 * pad);
  const yFor = (v: number) => h - pad - (v / max) * (h - 2 * pad);

  const line = curve.map((p, i) => `${xFor(i)},${yFor(p.throughput)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${xFor(n - 1)},${h - pad}`;

  const recX = xFor(recommended - 1);
  const curIdx = Math.min(Math.max(current, 1), n) - 1;
  const curX = xFor(curIdx);
  const curY = yFor(curve[curIdx]?.throughput ?? 0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2.5 w-full">
      <polygon points={area} fill="#5eead4" fillOpacity={0.08} />
      <polyline points={line} fill="none" stroke="#5eead4" strokeWidth={1.6} />
      <line
        x1={recX}
        x2={recX}
        y1={pad}
        y2={h - pad}
        stroke="#5eead4"
        strokeOpacity={0.45}
        strokeDasharray="3 3"
      />
      <circle cx={curX} cy={curY} r={3.2} fill="#fbbf24" stroke="#0a0c12" strokeWidth={1} />
    </svg>
  );
}
