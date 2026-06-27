/**
 * Headless performance / scaling benchmark runner.
 *
 * Drives the real MAPF engine (src/sim) across fleet sizes, scenarios and seeds,
 * measuring actual per-tick planning latency, delivery throughput and the
 * collision-free invariant, then emits:
 *
 *   - a Markdown summary on stdout (paste-ready for the README),
 *   - docs/benchmark.json with the raw + aggregated numbers and the environment,
 *   - docs/benchmark-scaling.svg, a small chart rendered from the measured data.
 *
 * Run with:  npm run bench
 * (uses vite-node so it executes the TypeScript engine directly).
 */

import { cpus } from 'os';
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  AggregateResult,
  RunResult,
  aggregate,
  runOnce,
  sweepFleetSize,
} from '../src/sim/scaling';
import { PlannerKind } from '../src/sim/engine';
import { ScenarioId } from '../src/sim/types';

const SCENARIOS: ScenarioId[] = ['apartment', 'factory', 'warehouse'];
const FLEET_SIZES = [2, 4, 6, 8, 12, 16];
const SEEDS = [1, 2, 3];
const TICKS = 300;

// Planner head-to-head (prioritized vs optimal CBS) on one scenario; CBS is far
// heavier, so keep this sweep small.
const CMP_SCENARIO: ScenarioId = 'factory';
const CMP_SIZES = [4, 8, 12];
const CMP_SEEDS = [1, 2];
const CMP_TICKS = 200;

const r1 = (x: number) => x.toFixed(1);
const r2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function progress(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

function scenarioTable(rows: AggregateResult[]): string {
  const head =
    '| Agents | Throughput (del/min) | Planning (ms/tick) | Avg wait (ticks) | Congestion | Deadlocks | Collisions | Success |\n' +
    '| -----: | -------------------: | -----------------: | ---------------: | ---------: | --------: | ---------: | ------: |';
  const body = rows
    .map(
      (a) =>
        `| ${a.robots} | ${r1(a.throughput)} | ${r2(a.msPerTick)} | ${r1(a.avgWaitPerDelivery)} | ${pct(
          a.congestion,
        )} | ${r1(a.deadlocksResolved)} | ${a.collisions} | ${pct(a.successRate)} |`,
    )
    .join('\n');
  return `${head}\n${body}`;
}

function comparisonTable(byKey: Map<string, AggregateResult>): string {
  const head =
    '| Agents | Planner | Throughput (del/min) | Planning (ms/tick) | Avg wait (ticks) | Congestion |\n' +
    '| -----: | ------- | -------------------: | -----------------: | ---------------: | ---------: |';
  const lines: string[] = [];
  for (const robots of CMP_SIZES) {
    for (const planner of ['prioritized', 'cbs'] as PlannerKind[]) {
      const a = byKey.get(`${robots}|${planner}`)!;
      lines.push(
        `| ${robots} | ${planner} | ${r1(a.throughput)} | ${r2(a.msPerTick)} | ${r1(
          a.avgWaitPerDelivery,
        )} | ${pct(a.congestion)} |`,
      );
    }
  }
  return `${head}\n${lines.join('\n')}`;
}

// --- tiny dependency-free SVG line chart -----------------------------------

interface Series {
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

function panel(
  x0: number,
  y0: number,
  w: number,
  h: number,
  title: string,
  yLabel: string,
  xs: number[],
  series: Series[],
): string {
  const padL = 46;
  const padB = 28;
  const padT = 24;
  const padR = 12;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...series.flatMap((s) => s.points.map((p) => p.y))) * 1.1 || 1;
  const sx = (vx: number) => x0 + padL + ((vx - xMin) / (xMax - xMin || 1)) * plotW;
  const sy = (vy: number) => y0 + padT + plotH - (vy / yMax) * plotH;

  const parts: string[] = [];
  parts.push(
    `<text x="${x0 + w / 2}" y="${y0 + 15}" text-anchor="middle" font-size="13" font-weight="600" fill="#1f2937">${title}</text>`,
  );
  // y grid + ticks
  const yTicks = 4;
  for (let i = 0; i <= yTicks; i++) {
    const v = (yMax / yTicks) * i;
    const yy = sy(v);
    parts.push(
      `<line x1="${x0 + padL}" y1="${yy}" x2="${x0 + padL + plotW}" y2="${yy}" stroke="#e5e7eb" stroke-width="1"/>`,
    );
    parts.push(
      `<text x="${x0 + padL - 6}" y="${yy + 3}" text-anchor="end" font-size="9" fill="#6b7280">${v >= 10 ? v.toFixed(0) : v.toFixed(1)}</text>`,
    );
  }
  // x ticks
  for (const vx of xs) {
    parts.push(
      `<text x="${sx(vx)}" y="${y0 + padT + plotH + 14}" text-anchor="middle" font-size="9" fill="#6b7280">${vx}</text>`,
    );
  }
  parts.push(
    `<text x="${x0 + padL + plotW / 2}" y="${y0 + h - 2}" text-anchor="middle" font-size="10" fill="#374151">agents</text>`,
  );
  parts.push(
    `<text x="${x0 + 11}" y="${y0 + padT + plotH / 2}" text-anchor="middle" font-size="10" fill="#374151" transform="rotate(-90 ${x0 + 11} ${y0 + padT + plotH / 2})">${yLabel}</text>`,
  );
  // axis lines
  parts.push(
    `<line x1="${x0 + padL}" y1="${y0 + padT}" x2="${x0 + padL}" y2="${y0 + padT + plotH}" stroke="#9ca3af" stroke-width="1"/>`,
  );
  parts.push(
    `<line x1="${x0 + padL}" y1="${y0 + padT + plotH}" x2="${x0 + padL + plotW}" y2="${y0 + padT + plotH}" stroke="#9ca3af" stroke-width="1"/>`,
  );
  // series
  for (const s of series) {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`);
    for (const p of s.points) {
      parts.push(`<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.5" fill="${s.color}"/>`);
    }
  }
  return parts.join('\n');
}

function legend(x: number, y: number, series: Series[]): string {
  const parts: string[] = [];
  let cx = x;
  for (const s of series) {
    parts.push(`<rect x="${cx}" y="${y - 8}" width="11" height="11" rx="2" fill="${s.color}"/>`);
    parts.push(`<text x="${cx + 15}" y="${y + 1}" font-size="11" fill="#374151">${s.label}</text>`);
    cx += 22 + s.label.length * 7;
  }
  return parts.join('\n');
}

function renderSvg(byScenario: Map<ScenarioId, AggregateResult[]>): string {
  const colors: Record<ScenarioId, string> = {
    apartment: '#2563eb',
    factory: '#dc2626',
    warehouse: '#059669',
  };
  const xs = FLEET_SIZES;
  const tput: Series[] = [];
  const lat: Series[] = [];
  for (const sc of SCENARIOS) {
    const rows = byScenario.get(sc)!;
    tput.push({
      label: sc,
      color: colors[sc],
      points: rows.map((a) => ({ x: a.robots, y: a.throughput })),
    });
    lat.push({
      label: sc,
      color: colors[sc],
      points: rows.map((a) => ({ x: a.robots, y: a.msPerTick })),
    });
  }
  const W = 760;
  const H = 320;
  const pw = 360;
  const ph = 250;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,Segoe UI,Roboto,sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    panel(8, 18, pw, ph, 'Throughput vs fleet size', 'deliveries / min', xs, tput),
    panel(8 + pw + 16, 18, pw, ph, 'Planning latency vs fleet size', 'ms / tick', xs, lat),
    legend(20, H - 14, tput),
    `</svg>`,
  ].join('\n');
}

// --- main ------------------------------------------------------------------

function main(): void {
  const started = Date.now();
  progress(`Fleet-size sweep: ${SCENARIOS.join(', ')} x ${FLEET_SIZES.join(',')} agents x ${SEEDS.length} seeds, ${TICKS} ticks`);

  const allRuns: RunResult[] = [];
  const sweep = sweepFleetSize(SCENARIOS, FLEET_SIZES, SEEDS, TICKS, 'prioritized', (r) => {
    allRuns.push(r);
    progress(`  ${r.scenario} n=${r.robots} seed=${r.seed}: ${r2(r.msPerTick)} ms/tick, ${r.deliveries} deliveries, ${r.collisions} collisions`);
  });

  const byScenario = new Map<ScenarioId, AggregateResult[]>();
  for (const a of sweep) {
    const list = byScenario.get(a.scenario) ?? [];
    list.push(a);
    byScenario.set(a.scenario, list);
  }

  progress(`\nPlanner comparison (${CMP_SCENARIO}): prioritized vs cbs`);
  const cmpRuns: RunResult[] = [];
  const cmpAgg = new Map<string, AggregateResult>();
  for (const robots of CMP_SIZES) {
    for (const planner of ['prioritized', 'cbs'] as PlannerKind[]) {
      const runs: RunResult[] = [];
      for (const seed of CMP_SEEDS) {
        const r = runOnce({ scenario: CMP_SCENARIO, robots, planner, seed, ticks: CMP_TICKS });
        runs.push(r);
        cmpRuns.push(r);
        progress(`  ${planner} n=${robots} seed=${seed}: ${r2(r.msPerTick)} ms/tick, avgWait ${r1(r.avgWaitPerDelivery)}`);
      }
      cmpAgg.set(`${robots}|${planner}`, aggregate(runs));
    }
  }

  // --- emit markdown ---
  const out: string[] = [];
  out.push('<!-- BENCHMARK:BEGIN (generated by scripts/benchmark.ts — do not edit by hand) -->');
  for (const sc of SCENARIOS) {
    out.push(`\n**${sc}** (${DEFAULT_DIMS(sc)}):\n`);
    out.push(scenarioTable(byScenario.get(sc)!));
  }
  out.push(`\n**Prioritized WHCA\\* vs optimal CBS** (${CMP_SCENARIO}, ${CMP_TICKS} ticks):\n`);
  out.push(comparisonTable(cmpAgg));
  out.push('\n<!-- BENCHMARK:END -->');
  const md = out.join('\n');
  process.stdout.write(`\n${md}\n`);

  // --- write artifacts ---
  const here = dirname(fileURLToPath(import.meta.url));
  const docs = resolve(here, '..', 'docs');
  const env = {
    node: process.version,
    cpu: cpus()[0]?.model ?? 'unknown',
    runner: 'vite-node',
    date: new Date().toISOString().slice(0, 10),
  };
  writeFileSync(
    resolve(docs, 'benchmark.json'),
    JSON.stringify({ env, config: { FLEET_SIZES, SEEDS, TICKS, CMP_SCENARIO, CMP_SIZES, CMP_SEEDS, CMP_TICKS }, sweep, comparison: [...cmpAgg.values()], raw: { allRuns, cmpRuns } }, null, 2) + '\n',
  );
  writeFileSync(resolve(docs, 'benchmark-scaling.svg'), renderSvg(byScenario) + '\n');

  progress(`\nWrote docs/benchmark.json and docs/benchmark-scaling.svg`);
  progress(`Env: node ${env.node}, ${env.cpu}, via ${env.runner}`);
  progress(`Total collisions across all runs: ${allRuns.reduce((a, r) => a + r.collisions, 0)}`);
  progress(`Done in ${r1((Date.now() - started) / 1000)}s`);
}

function DEFAULT_DIMS(sc: ScenarioId): string {
  const dims: Record<ScenarioId, string> = {
    apartment: '6 floors, 24x18',
    factory: '3 floors, 30x22',
    warehouse: '2 floors, 36x26',
  };
  return dims[sc];
}

main();
