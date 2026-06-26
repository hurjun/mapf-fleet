import { describe, it, expect } from 'vitest';
import { Engine } from './engine';
import { planMovesCBS } from './cbs';
import { DistanceFieldCache, planMoves } from './planner';
import { buildWorld, DEFAULT_PARAMS } from './scenarios';
import { Cell, FloorGrid, Robot, World } from './types';

/** Run a scenario under the CBS planner and assert the safety invariants. */
function runCBS(scenario: 'apartment' | 'factory', robots: number, ticks: number) {
  const world = buildWorld(DEFAULT_PARAMS[scenario]);
  const engine = new Engine(world, { robotCount: robots, seed: 5, planner: 'cbs' });

  for (let t = 0; t < ticks; t++) {
    engine.step();
    const snap = engine.snapshot();
    const occupied = new Set<string>();
    for (const r of snap.robots) {
      if (r.phase === 'riding') continue;
      const cell = world.floors[r.floor].cells[r.y * world.width + r.x];
      expect(cell).not.toBe(Cell.Wall);
      const key = `${r.floor}|${r.x}|${r.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
    }
  }
  return engine.snapshot().metrics.deliveries;
}

describe('CBS planner', () => {
  it('keeps the fleet collision-free and delivers (apartment)', () => {
    expect(runCBS('apartment', 6, 500)).toBeGreaterThan(0);
  });

  it('keeps the fleet collision-free and delivers (factory)', () => {
    expect(runCBS('factory', 8, 500)).toBeGreaterThan(0);
  });

  it('can switch planners live without breaking the run', () => {
    const world = buildWorld(DEFAULT_PARAMS.factory);
    const engine = new Engine(world, { robotCount: 8, seed: 3 });
    for (let t = 0; t < 200; t++) engine.step();
    engine.setPlanner('cbs');
    for (let t = 0; t < 200; t++) {
      engine.step();
      const snap = engine.snapshot();
      const occupied = new Set<string>();
      for (const r of snap.robots) {
        if (r.phase === 'riding') continue;
        const key = `${r.floor}|${r.x}|${r.y}`;
        expect(occupied.has(key)).toBe(false);
        occupied.add(key);
      }
    }
    expect(engine.snapshot().metrics.deliveries).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Direct unit tests of the CBS module on small, hand-crafted instances. These
// exercise `planMovesCBS` in isolation (no Engine), covering both conflict
// kinds — vertex (a crossing) and edge/swap (a head-on corridor) — and the
// completeness gap that motivates CBS over the bare prioritized planner.
// ---------------------------------------------------------------------------

/** Build a one-floor world from an ASCII map ('#' = wall, anything else free). */
function worldFromAscii(rows: string[]): World {
  const height = rows.length;
  const width = rows[0].length;
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      cells[y * width + x] = rows[y][x] === '#' ? Cell.Wall : Cell.Free;
    }
  }
  const floor: FloorGrid = { floor: 0, width, height, cells };
  return { scenario: 'factory', numFloors: 1, width, height, floors: [floor], elevators: [], stations: [] };
}

function makeRobot(id: number, x: number, y: number, gx: number, gy: number): Robot {
  return {
    id, kind: 'cart', floor: 0, x, y, phase: 'to_pickup', carrying: false, task: null,
    dest: { floor: 0, x: gx, y: gy }, nextX: x, nextY: y, yielding: false,
    elevatorId: null, targetFloor: null, dwell: 0, battery: 1, chargerId: null,
    plannedPath: [], deliveries: 0, waitTicks: 0, moveTicks: 0,
  };
}

type Spec = Array<[id: number, x: number, y: number, gx: number, gy: number]>;

/**
 * Drive a fleet to its goals one step at a time under the chosen planner,
 * asserting the safety invariants (no two robots in a cell, no head-on swap) on
 * every tick. Returns the tick at which every robot first sat on its goal, or -1
 * if that never happened within `ticks`.
 */
function runToGoals(rows: string[], spec: Spec, planner: 'prioritized' | 'cbs', window: number, ticks: number): number {
  const world = worldFromAscii(rows);
  const cache = new DistanceFieldCache(world);
  const robots = spec.map(([id, x, y, gx, gy]) => makeRobot(id, x, y, gx, gy));
  let arrived = -1;
  for (let t = 0; t < ticks; t++) {
    const prev = robots.map((r) => ({ x: r.x, y: r.y }));
    if (planner === 'cbs') planMovesCBS(world, robots, [], cache, window);
    else planMoves(world, robots, [], cache, window);

    const occupied = new Set<string>();
    for (const r of robots) {
      const k = `${r.nextX},${r.nextY}`;
      expect(occupied.has(k)).toBe(false); // no two robots claim the same cell
      occupied.add(k);
    }
    for (let a = 0; a < robots.length; a++) {
      for (let b = a + 1; b < robots.length; b++) {
        const swap =
          robots[a].nextX === prev[b].x && robots[a].nextY === prev[b].y &&
          robots[b].nextX === prev[a].x && robots[b].nextY === prev[a].y;
        expect(swap).toBe(false); // no head-on edge swap
      }
    }

    for (const r of robots) { r.x = r.nextX; r.y = r.nextY; }
    if (arrived < 0 && robots.every((r) => r.x === r.dest!.x && r.y === r.dest!.y)) arrived = t + 1;
  }
  return arrived;
}

describe('CBS module (planMovesCBS)', () => {
  it('resolves a perpendicular crossing collision-free (vertex conflict)', () => {
    // Two corridors meeting at the centre cell (1,1); the agents must not both
    // occupy it on the same tick.
    const map = ['#.#', '...', '#.#'];
    const arrived = runToGoals(map, [
      [0, 0, 1, 2, 1],
      [1, 1, 0, 1, 2],
    ], 'cbs', 12, 12);
    expect(arrived).toBeGreaterThan(0);
  });

  it('resolves a head-on corridor swap that the bare prioritized planner cannot', () => {
    // A 1-wide corridor (row y=1, x=0..4) with a single passing pocket at (1,0).
    // Swapping the two ends requires one robot to duck into the pocket — a
    // tightly-coupled instance where greedy prioritized planning deadlocks but
    // CBS finds a coordinated, collision-free solution.
    const map = ['#.###', '.....', '#####'];
    const spec: Spec = [
      [0, 0, 1, 4, 1],
      [1, 4, 1, 0, 1],
    ];

    // CBS coordinates both robots all the way to their goals.
    expect(runToGoals(map, spec, 'cbs', 16, 16)).toBeGreaterThan(0);

    // The prioritized planner alone (no engine deadlock-breaking shuffle) is
    // incomplete: it stays collision-free but never completes the swap. This is
    // the classic prioritized-planning failure that CBS is designed to avoid.
    expect(runToGoals(map, spec, 'prioritized', 16, 60)).toBe(-1);
  });
});
