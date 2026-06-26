/**
 * Head-to-head planner benchmark.
 *
 * Runs the same building, fleet size, and seed under each planner for a fixed
 * number of ticks and reports the outcome plus the compute time, so the classic
 * MAPF trade-off — solution quality vs. computational cost — is concrete: CBS
 * usually yields smoother coordination (less waiting) but costs far more compute
 * than prioritized planning.
 */

import { Engine, PlannerKind } from './engine';
import { buildWorld, ScenarioParams } from './scenarios';

export interface PlannerResult {
  deliveries: number;
  avgWait: number;
  congestion: number;
  /** Wall-clock milliseconds to simulate the run. */
  ms: number;
}

export interface BenchmarkResult {
  ticks: number;
  robots: number;
  prioritized: PlannerResult;
  cbs: PlannerResult;
}

export function comparePlanners(
  params: ScenarioParams,
  robotCount: number,
  ticks = 400,
  seed = 99,
): BenchmarkResult {
  const run = (planner: PlannerKind): PlannerResult => {
    const world = buildWorld(params);
    const engine = new Engine(world, {
      robotCount,
      seed,
      loadTicks: 4,
      unloadTicks: 4,
      tickSeconds: 1,
      planner,
    });
    const t0 = performance.now();
    for (let t = 0; t < ticks; t++) engine.step();
    const ms = performance.now() - t0;
    const m = engine.snapshot().metrics;
    return { deliveries: m.deliveries, avgWait: m.avgWaitPerDelivery, congestion: m.congestion, ms };
  };

  return {
    ticks,
    robots: robotCount,
    prioritized: run('prioritized'),
    cbs: run('cbs'),
  };
}
