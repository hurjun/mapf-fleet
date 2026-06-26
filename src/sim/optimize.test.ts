import { describe, it, expect } from 'vitest';
import { optimizeFleet } from './optimize';
import { DEFAULT_PARAMS, ScenarioParams } from './scenarios';

function run(overrides: Partial<ScenarioParams> = {}, maxRobots = 24) {
  const params = { ...DEFAULT_PARAMS.apartment, ...overrides };
  return optimizeFleet({ params, loadTicks: 4, unloadTicks: 4, tickSeconds: 1, maxRobots });
}

describe('optimizeFleet', () => {
  it('produces sane recommendations for every scenario', () => {
    for (const id of ['apartment', 'factory', 'warehouse'] as const) {
      const r = optimizeFleet({
        params: DEFAULT_PARAMS[id],
        loadTicks: 4,
        unloadTicks: 4,
        tickSeconds: 1,
        maxRobots: 24,
      });
      expect(r.curve).toHaveLength(24);
      expect(r.maxThroughput).toBeGreaterThan(0);
      expect(r.recommended).toBeGreaterThanOrEqual(1);
      expect(r.recommended).toBeLessThanOrEqual(r.best);
      expect(r.pickupToElevator).toBeGreaterThan(0);
    }
  });

  it('produces a well-formed result', () => {
    const r = run();
    expect(r.curve).toHaveLength(24);
    expect(r.best).toBeGreaterThanOrEqual(1);
    expect(r.best).toBeLessThanOrEqual(24);
    expect(r.recommended).toBeGreaterThanOrEqual(1);
    expect(r.recommended).toBeLessThanOrEqual(r.best);
    expect(r.pickupToElevator).toBeGreaterThan(0);
    expect(r.dropoffToElevator).toBeGreaterThan(0);
    for (const p of r.curve) expect(Number.isFinite(p.throughput)).toBe(true);
  });

  it('throughput rises as robots are added from one', () => {
    const r = run();
    expect(r.curve[0].throughput).toBeLessThan(r.maxThroughput);
  });

  it('more elevators raise the achievable throughput', () => {
    const few = run({ elevatorCount: 1 });
    const many = run({ elevatorCount: 4 });
    expect(many.maxThroughput).toBeGreaterThan(few.maxThroughput);
  });

  it('more elevator capacity raises the elevator ceiling', () => {
    const small = run({ elevatorCapacity: 1 });
    const large = run({ elevatorCapacity: 6 });
    expect(large.elevatorCeiling).toBeGreaterThan(small.elevatorCeiling);
  });

  it('a single elevator on a tall tower is elevator-bound', () => {
    const r = run({ elevatorCount: 1, numFloors: 8 });
    expect(r.bottleneck).toBe('elevators');
  });

  it('recommends a smaller fleet than the slider maximum when it saturates', () => {
    const r = run({ elevatorCount: 1 }, 24);
    // With a single elevator the curve plateaus early, so the recommendation
    // should be well below the maximum the user could place.
    expect(r.recommended).toBeLessThan(24);
  });
});
