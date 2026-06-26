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

/** One sampled point of the live metric time series. */
export interface MetricSample {
  throughput: number;
  congestion: number;
  elevator: number;
}

const HISTORY_LEN = 150;

interface SimState {
  scenario: ScenarioId;
  params: ScenarioParams;
  robotCount: number;
  /** Playback rate in engine ticks per second. */
  speed: number;
  running: boolean;

  /** Active multi-agent planner. */
  planner: PlannerKind;
  /** Currently inspected robot, or null. */
  selectedRobotId: number | null;
  /** Whether to draw every robot's planned path. */
  showPaths: boolean;
  /** Floor shown in the minimap / used by single-floor focus. */
  viewFloor: number;
  /** Whether to isolate `viewFloor` in the 3D view (dim the others). */
  focusFloor: boolean;

  world: World;
  snapshot: Snapshot;
  optimizer: OptimizeResult;
  /** Fleet composition; changes only when robots are added/removed. */
  roster: RosterEntry[];
  /**
   * Measured throughput observed at each fleet size this session (deliveries
   * per minute, smoothed). Plotted against the optimizer's prediction so users
   * can compare the model to reality. Reset whenever the building changes.
   */
  measured: Record<number, number>;
  /** Rolling history of recent metric samples for the time-series charts. */
  history: MetricSample[];

  // Actions.
  tick: () => void;
  setScenario: (id: ScenarioId) => void;
  setParam: (key: NumericParamKey, value: number) => void;
  setRobotCount: (n: number) => void;
  setSpeed: (n: number) => void;
  setPlanner: (kind: PlannerKind) => void;
  setSelected: (id: number | null) => void;
  setShowPaths: (v: boolean) => void;
  setViewFloor: (f: number) => void;
  setFocusFloor: (v: boolean) => void;
  togglePlay: () => void;
  applyRecommended: () => void;
  reset: () => void;
}

// The live engine — intentionally outside React state. Assigned by spawnEngine()
// during module initialization (the `!` asserts this definite assignment).
let engine!: Engine;

// Smoothed measured throughput per fleet size; reset when the building changes.
let measuredThroughput: Record<number, number> = {};

// Rolling metric history (module-level ring buffer; reset on rebuild).
let history: MetricSample[] = [];

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
  measuredThroughput = {}; // a new building invalidates past measurements
  history = [];
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
  selectedRobotId: null,
  showPaths: false,
  viewFloor: 0,
  focusFloor: false,
  world: initialWorld,
  snapshot: initialSnapshot,
  optimizer: initialOptimizer,
  roster: rosterFrom(initialSnapshot),
  measured: {},
  history: [],

  tick: () => {
    engine.step();
    const snapshot = engine.snapshot();
    // Record measured throughput for the current fleet size once the trailing
    // throughput window has filled, smoothing it so the overlay is stable.
    if (snapshot.tick > 120) {
      const rc = engine.robotCount;
      const prev = measuredThroughput[rc] ?? snapshot.metrics.throughput;
      measuredThroughput = {
        ...measuredThroughput,
        [rc]: prev * 0.97 + snapshot.metrics.throughput * 0.03,
      };
    }

    const m = snapshot.metrics;
    history = history.concat({
      throughput: m.throughput,
      congestion: m.congestion,
      elevator: m.elevatorUtilization,
    });
    if (history.length > HISTORY_LEN) history = history.slice(history.length - HISTORY_LEN);

    set({ snapshot, measured: measuredThroughput, history });
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
      selectedRobotId: null,
      viewFloor: 0,
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
      selectedRobotId: null,
      viewFloor: 0,
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
  setSelected: (id) => set({ selectedRobotId: id }),
  setShowPaths: (v) => set({ showPaths: v }),
  setViewFloor: (f) => {
    const max = get().world.numFloors - 1;
    set({ viewFloor: Math.max(0, Math.min(f, max)) });
  },
  setFocusFloor: (v) => set({ focusFloor: v }),
  togglePlay: () => set((s) => ({ running: !s.running })),
  applyRecommended: () => get().setRobotCount(get().optimizer.recommended),

  reset: () => {
    const world = spawnEngine(get().params, get().robotCount, get().planner);
    const snapshot = engine.snapshot();
    set({
      world,
      snapshot,
      robotCount: engine.robotCount,
      roster: rosterFrom(snapshot),
      selectedRobotId: null,
    });
  },
}));
