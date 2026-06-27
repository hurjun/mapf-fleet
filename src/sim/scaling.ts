/**
 * Headless scaling benchmark over the real MAPF engine.
 *
 * This measures, for a given world and fleet size, the *actual* per-tick
 * planning cost (wall-clock time spent inside `Engine.step()`, which is
 * dominated by the multi-agent planner) alongside the delivery throughput and
 * coordination quality the planner achieves. It also verifies the collision-free
 * invariant on every tick, so the safety guarantee is checked at scale across
 * many fleet sizes and seeds — not just in the unit tests.
 *
 * Everything here is pure, deterministic TypeScript that drives the public
 * `Engine` API; it does not touch engine internals. Run it with the companion
 * `scripts/benchmark.ts` (e.g. `npm run bench`).
 */

import { Engine, PlannerKind } from './engine';
import { buildWorld, DEFAULT_PARAMS } from './scenarios';
import { ScenarioId } from './types';

export interface RunResult {
  scenario: ScenarioId;
  robots: number;
  planner: PlannerKind;
  seed: number;
  ticks: number;
  /** Mean wall-clock milliseconds spent in one `Engine.step()` (planning-dominated). */
  msPerTick: number;
  /** Deliveries per simulated minute over the trailing window at the end of the run. */
  throughput: number;
  /** Total completed deliveries over the whole run. */
  deliveries: number;
  /** Average ticks a robot waited per completed delivery. */
  avgWaitPerDelivery: number;
  /** Fraction of the fleet waiting/yielding at the end of the run (0..1). */
  congestion: number;
  /** Deadlocks the engine detected and recovered from during the run. */
  deadlocksResolved: number;
  /**
   * Number of ticks on which two robots occupied the same grid cell. The
   * planner guarantees this stays 0; we check it every tick as a safety probe.
   */
  collisions: number;
  /** True when the run was collision-free and completed deliveries (stayed live). */
  live: boolean;
}

export interface RunConfig {
  scenario: ScenarioId;
  robots: number;
  planner?: PlannerKind;
  seed?: number;
  /** Timed ticks. */
  ticks?: number;
  /** Untimed warm-up ticks (let the JIT settle and the fleet disperse). */
  warmup?: number;
}

/**
 * Count grid cells shared by two or more robots on the same floor — i.e.
 * collisions. Riders inside an elevator car are not on the grid and are skipped.
 */
function countCellCollisions(engine: Engine): number {
  const seen = new Set<string>();
  let collisions = 0;
  for (const r of engine.snapshot().robots) {
    if (r.phase === 'riding') continue;
    const key = `${r.floor}|${r.x}|${r.y}`;
    if (seen.has(key)) collisions++;
    else seen.add(key);
  }
  return collisions;
}

/** Simulate one (scenario, fleet size, planner, seed) configuration. */
export function runOnce(cfg: RunConfig): RunResult {
  const planner = cfg.planner ?? 'prioritized';
  const seed = cfg.seed ?? 1;
  const ticks = cfg.ticks ?? 350;
  const warmup = cfg.warmup ?? 40;

  const world = buildWorld(DEFAULT_PARAMS[cfg.scenario]);
  const engine = new Engine(world, { robotCount: cfg.robots, seed, planner });

  let collisions = 0;
  for (let t = 0; t < warmup; t++) {
    engine.step();
    collisions += countCellCollisions(engine);
  }

  // Time only the planner/step call; the collision probe runs untimed so it
  // never inflates the reported planning latency.
  let stepMs = 0;
  for (let t = 0; t < ticks; t++) {
    const t0 = performance.now();
    engine.step();
    stepMs += performance.now() - t0;
    collisions += countCellCollisions(engine);
  }

  const m = engine.snapshot().metrics;
  return {
    scenario: cfg.scenario,
    robots: engine.robotCount,
    planner,
    seed,
    ticks,
    msPerTick: stepMs / ticks,
    throughput: m.throughput,
    deliveries: m.deliveries,
    avgWaitPerDelivery: m.avgWaitPerDelivery,
    congestion: m.congestion,
    deadlocksResolved: m.deadlocksResolved,
    collisions,
    live: collisions === 0 && m.deliveries > 0,
  };
}

export interface AggregateResult {
  scenario: ScenarioId;
  robots: number;
  planner: PlannerKind;
  seeds: number;
  msPerTick: number;
  throughput: number;
  deliveries: number;
  avgWaitPerDelivery: number;
  congestion: number;
  deadlocksResolved: number;
  collisions: number;
  /** Fraction of seeds whose run was collision-free and still live (0..1). */
  successRate: number;
}

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Average a set of repeated runs (same scenario/fleet/planner, different seeds). */
export function aggregate(runs: RunResult[]): AggregateResult {
  const first = runs[0];
  return {
    scenario: first.scenario,
    robots: first.robots,
    planner: first.planner,
    seeds: runs.length,
    msPerTick: mean(runs.map((r) => r.msPerTick)),
    throughput: mean(runs.map((r) => r.throughput)),
    deliveries: mean(runs.map((r) => r.deliveries)),
    avgWaitPerDelivery: mean(runs.map((r) => r.avgWaitPerDelivery)),
    congestion: mean(runs.map((r) => r.congestion)),
    deadlocksResolved: mean(runs.map((r) => r.deadlocksResolved)),
    collisions: runs.reduce((a, r) => a + r.collisions, 0),
    successRate: mean(runs.map((r) => (r.live ? 1 : 0))),
  };
}

/**
 * Sweep fleet size across scenarios and seeds under one planner, returning the
 * per-configuration averages.
 */
export function sweepFleetSize(
  scenarios: ScenarioId[],
  fleetSizes: number[],
  seeds: number[],
  ticks: number,
  planner: PlannerKind = 'prioritized',
  onResult?: (r: RunResult) => void,
): AggregateResult[] {
  const out: AggregateResult[] = [];
  for (const scenario of scenarios) {
    for (const robots of fleetSizes) {
      const runs: RunResult[] = [];
      for (const seed of seeds) {
        const r = runOnce({ scenario, robots, seed, ticks, planner });
        runs.push(r);
        onResult?.(r);
      }
      out.push(aggregate(runs));
    }
  }
  return out;
}
