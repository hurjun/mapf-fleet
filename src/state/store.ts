'use client';

/**
 * Global application state (Zustand).
 *
 * The store owns the single simulation `Engine` instance and exposes the data
 * the React tree renders from. The engine itself is mutable and lives outside
 * React state (a module variable) — only the lightweight per-tick `snapshot`
 * and the user-facing controls are tracked reactively, which keeps re-renders
 * cheap even though the simulation advances many times per second.
 */

import { create } from 'zustand';
import { Engine, PlannerKind, Snapshot } from '@/sim/engine';
import { optimizeFleet, OptimizeResult } from '@/sim/optimize';
import { buildWorld, DEFAULT_PARAMS, PARAM_BOUNDS, ScenarioParams } from '@/sim/scenarios';
import { RobotKind, ScenarioId, World } from '@/sim/types';

/** Fixed simulation tunables shared by the engine and the optimizer. */
const SIM = { loadTicks: 4, unloadTicks: 4, tickSeconds: 1, seed: 42 } as const;

/** Scenario parameters the user can edit through the sliders. */
export type NumericParamKey =
  | 'numFloors'
  | 'width'
  | 'height'
  | 'elevatorCount'
  | 'elevatorCapacity';

/** Stable per-robot identity for the React render tree (id + kind). */
export interface RosterEntry {
  id: number;
  kind: RobotKind;
}

interface SimState {
  scenario: ScenarioId;
  params: ScenarioParams;
  robotCount: number;
  /** Playback rate in engine ticks per second. */
  speed: number;
  running: boolean;

  /** Active multi-agent planner. */
  planner: PlannerKind;

  world: World;
  snapshot: Snapshot;
  optimizer: OptimizeResult;
  /** Fleet composition; changes only when robots are added/removed. */
  roster: RosterEntry[];

  // Actions.
  tick: () => void;
  setScenario: (id: ScenarioId) => void;
  setParam: (key: NumericParamKey, value: number) => void;
  setRobotCount: (n: number) => void;
  setSpeed: (n: number) => void;
  setPlanner: (kind: PlannerKind) => void;
  togglePlay: () => void;
  applyRecommended: () => void;
  reset: () => void;
}

// The live engine — intentionally outside React state. Assigned by spawnEngine()
// during module initialization (the `!` asserts this definite assignment).
let engine!: Engine;

function makeOptimizer(params: ScenarioParams): OptimizeResult {
  return optimizeFleet({
    params,
    loadTicks: SIM.loadTicks,
    unloadTicks: SIM.unloadTicks,
    tickSeconds: SIM.tickSeconds,
    maxRobots: PARAM_BOUNDS.robotCount.max,
  });
}

function spawnEngine(params: ScenarioParams, robotCount: number, planner: PlannerKind): World {
  const world = buildWorld(params);
  engine = new Engine(world, {
    robotCount,
    seed: SIM.seed,
    loadTicks: SIM.loadTicks,
    unloadTicks: SIM.unloadTicks,
    tickSeconds: SIM.tickSeconds,
    planner,
  });
  return world;
}

function rosterFrom(snapshot: Snapshot): RosterEntry[] {
  return snapshot.robots.map((r) => ({ id: r.id, kind: r.kind }));
}

// Initial world: the apartment high-rise at its recommended fleet size.
const initialParams = DEFAULT_PARAMS.apartment;
const initialOptimizer = makeOptimizer(initialParams);
const initialWorld = spawnEngine(initialParams, initialOptimizer.recommended, 'prioritized');
const initialSnapshot = engine.snapshot();

export const useSim = create<SimState>((set, get) => ({
  scenario: 'apartment',
  params: initialParams,
  robotCount: engine.robotCount,
  speed: 6,
  running: true,
  planner: 'prioritized',
  world: initialWorld,
  snapshot: initialSnapshot,
  optimizer: initialOptimizer,
  roster: rosterFrom(initialSnapshot),

  tick: () => {
    engine.step();
    set({ snapshot: engine.snapshot() });
  },

  setScenario: (id) => {
    const params = DEFAULT_PARAMS[id];
    const optimizer = makeOptimizer(params);
    const world = spawnEngine(params, optimizer.recommended, get().planner);
    const snapshot = engine.snapshot();
    set({
      scenario: id,
      params,
      optimizer,
      world,
      snapshot,
      robotCount: engine.robotCount,
      roster: rosterFrom(snapshot),
    });
  },

  setParam: (key, value) => {
    const params = { ...get().params, [key]: value };
    const optimizer = makeOptimizer(params);
    const world = spawnEngine(params, get().robotCount, get().planner);
    const snapshot = engine.snapshot();
    set({
      params,
      optimizer,
      world,
      snapshot,
      robotCount: engine.robotCount,
      roster: rosterFrom(snapshot),
    });
  },

  setRobotCount: (n) => {
    engine.setRobotCount(n);
    const snapshot = engine.snapshot();
    set({ robotCount: engine.robotCount, snapshot, roster: rosterFrom(snapshot) });
  },

  setSpeed: (n) => set({ speed: n }),
  setPlanner: (kind) => {
    engine.setPlanner(kind);
    set({ planner: kind });
  },
  togglePlay: () => set((s) => ({ running: !s.running })),
  applyRecommended: () => get().setRobotCount(get().optimizer.recommended),

  reset: () => {
    const world = spawnEngine(get().params, get().robotCount, get().planner);
    const snapshot = engine.snapshot();
    set({ world, snapshot, robotCount: engine.robotCount, roster: rosterFrom(snapshot) });
  },
}));
