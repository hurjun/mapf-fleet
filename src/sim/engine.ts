/**
 * The simulation engine.
 *
 * One `step()` advances the world by a single tick:
 *   1. resolve dwell timers and finished deliveries
 *   2. hand idle robots a fresh task (demand is unlimited, so the fleet stays
 *      saturated — exactly the regime the fleet-size optimizer reasons about)
 *   3. work out each robot's destination on its current floor
 *   4. advance the elevators (board / unload / move)
 *   5. plan collision-free moves for everyone navigating and apply them
 *   6. handle arrivals (start loading/unloading, or join an elevator queue)
 *   7. refresh live metrics
 *
 * The engine is pure TypeScript with no rendering or DOM dependencies, so it
 * runs identically in tests and in the browser.
 */

import { planMovesCBS } from './cbs';
import { ElevatorController } from './elevator';
import { isWalkable, manhattan } from './grid';
import { DistanceFieldCache, planMoves, StaticObstacle } from './planner';
import { Rng } from './rng';
import {
  Cell3,
  ElevatorSnapshot,
  Metrics,
  Robot,
  RobotKind,
  RobotSnapshot,
  Station,
  Task,
  World,
} from './types';

export interface EngineOptions {
  robotCount: number;
  seed: number;
  /** Planning horizon in ticks. */
  planWindow?: number;
  /** Dwell ticks to load at a pickup. */
  loadTicks?: number;
  /** Dwell ticks to unload at a dropoff. */
  unloadTicks?: number;
  /** Simulated seconds represented by one tick (for time-based metrics). */
  tickSeconds?: number;
  /** Robot kinds to cycle through when spawning. */
  kinds?: RobotKind[];
  /** Multi-agent planner: fast prioritized planning, or optimal CBS. */
  planner?: PlannerKind;
}

export type PlannerKind = 'prioritized' | 'cbs';

const DEFAULT_KINDS: RobotKind[] = ['forklift', 'cart', 'lifter', 'scout'];

/** If the whole fleet makes no progress for this many ticks, recover. */
const STALL_THRESHOLD = 14;
/** Ticks of randomized-priority planning used to break a detected deadlock. */
const RECOVERY_DURATION = 8;

/**
 * Battery model. Drain is per active tick (higher while carrying); a robot
 * diverts to a charger once it drops below `low`, and recharges at `charge`/tick.
 * Exported so the optimizer can fold the resulting charging downtime into its
 * availability factor.
 */
export const BATTERY = {
  start: 0.55,
  startSpread: 0.45,
  low: 0.25,
  drainIdle: 0.0005,
  drainMove: 0.0012,
  drainCarry: 0.0016,
  charge: 0.012,
} as const;

export interface Snapshot {
  tick: number;
  robots: RobotSnapshot[];
  elevators: ElevatorSnapshot[];
  metrics: Metrics;
}

export class Engine {
  readonly world: World;
  readonly opts: Required<EngineOptions>;

  private robots: Robot[] = [];
  private byId = new Map<number, Robot>();
  private controllers: ElevatorController[];
  private controllerById = new Map<number, ElevatorController>();
  private cache: DistanceFieldCache;
  private rng: Rng;
  private plannerKind: PlannerKind;
  /** Decaying per-cell congestion accumulator, one array per floor. */
  private heat: Float32Array[];

  private nextRobotId = 0;
  private nextTaskId = 0;
  private spawnCells: Cell3[];

  private pickups: Station[];
  private dropoffs: Station[];
  private chargers: Station[];
  private chargerById = new Map<number, Station>();
  private occupiedChargers = new Set<number>();

  tick = 0;
  private totalDeliveries = 0;
  private deliveryTicks: number[] = [];
  private throughput = 0;

  // Deadlock detection / recovery state.
  private stallTicks = 0;
  private recoveryTicks = 0;
  private recoverySalt = 0;
  private totalDeadlocks = 0;

  constructor(world: World, opts: EngineOptions) {
    this.world = world;
    this.opts = {
      planWindow: 16,
      loadTicks: 4,
      unloadTicks: 4,
      tickSeconds: 1,
      kinds: DEFAULT_KINDS,
      planner: 'prioritized',
      ...opts,
    };
    this.plannerKind = this.opts.planner;
    this.rng = new Rng(opts.seed);
    this.cache = new DistanceFieldCache(world);
    this.controllers = world.elevators.map((e) => new ElevatorController(e));
    for (const c of this.controllers) this.controllerById.set(c.cfg.id, c);

    this.pickups = world.stations.filter((s) => s.role === 'pickup');
    this.dropoffs = world.stations.filter((s) => s.role === 'dropoff');
    this.chargers = world.stations.filter((s) => s.role === 'charger');
    for (const c of this.chargers) this.chargerById.set(c.id, c);
    this.heat = world.floors.map(() => new Float32Array(world.width * world.height));
    this.spawnCells = this.computeSpawnCells();

    this.setRobotCount(this.opts.robotCount);
  }

  // ---- public API ---------------------------------------------------------

  get robotCount(): number {
    return this.robots.length;
  }

  setRobotCount(target: number): void {
    target = Math.max(0, Math.min(target, this.spawnCells.length));
    while (this.robots.length < target) this.addRobot();
    while (this.robots.length > target) this.removeRobot();
  }

  /** Switch the multi-agent planner live (no restart needed). */
  setPlanner(kind: PlannerKind): void {
    this.plannerKind = kind;
  }

  step(): void {
    this.tick++;
    this.updateDwell();
    this.updateCharging();
    this.assignTasks();
    this.resolveDestinations();
    this.stepElevators();
    this.planAndMove();
    this.handleArrivals();
    this.updateBattery();
    this.updateHeat();
    this.updateThroughput();
  }

  /** Per-floor congestion field this layer reads to draw the heatmap. */
  heatField(floor: number): Float32Array {
    return this.heat[floor] ?? new Float32Array(0);
  }

  snapshot(): Snapshot {
    return {
      tick: this.tick,
      robots: this.robots.map((r) => this.robotSnapshot(r)),
      elevators: this.controllers.map((c) => c.snapshot(this.queuedFor(c.cfg.id))),
      metrics: this.computeMetrics(),
    };
  }

  // ---- robot lifecycle ----------------------------------------------------

  private addRobot(): void {
    const cell = this.spawnCells[this.robots.length];
    if (!cell) return;
    const kind = this.opts.kinds[this.nextRobotId % this.opts.kinds.length];
    const robot: Robot = {
      id: this.nextRobotId++,
      kind,
      floor: cell.floor,
      x: cell.x,
      y: cell.y,
      phase: 'idle',
      carrying: false,
      task: null,
      dest: null,
      nextX: cell.x,
      nextY: cell.y,
      yielding: false,
      elevatorId: null,
      targetFloor: null,
      dwell: 0,
      battery: BATTERY.start + this.rng.next() * BATTERY.startSpread,
      chargerId: null,
      plannedPath: [],
      deliveries: 0,
      waitTicks: 0,
      moveTicks: 0,
    };
    this.robots.push(robot);
    this.byId.set(robot.id, robot);
  }

  private removeRobot(): void {
    const robot = this.robots.pop();
    if (!robot) return;
    this.byId.delete(robot.id);
    if (robot.phase === 'riding' && robot.elevatorId != null) {
      this.controllerById.get(robot.elevatorId)?.removeRider(robot.id);
    }
    if (robot.chargerId != null) this.occupiedChargers.delete(robot.chargerId);
  }

  // ---- per-tick stages ----------------------------------------------------

  private updateDwell(): void {
    for (const r of this.robots) {
      if (r.phase !== 'loading' && r.phase !== 'unloading') continue;
      r.dwell--;
      if (r.dwell > 0) continue;
      if (r.phase === 'loading') {
        r.carrying = true;
        r.phase = 'to_dropoff';
        r.dest = null;
      } else {
        // Delivery complete.
        r.carrying = false;
        r.deliveries++;
        r.task = null;
        r.phase = 'idle';
        this.totalDeliveries++;
        this.deliveryTicks.push(this.tick);
      }
    }
  }

  /** Recharge robots parked on chargers; release them when full. */
  private updateCharging(): void {
    for (const r of this.robots) {
      if (r.phase !== 'charging') continue;
      r.battery = Math.min(1, r.battery + BATTERY.charge);
      if (r.battery >= 0.999) {
        if (r.chargerId != null) this.occupiedChargers.delete(r.chargerId);
        r.chargerId = null;
        r.phase = 'idle';
        r.dest = null;
      }
    }
  }

  private assignTasks(): void {
    if (this.pickups.length === 0 || this.dropoffs.length === 0) return;
    for (const r of this.robots) {
      if (r.phase !== 'idle') continue;

      // Low battery → divert to a free charger on this floor instead of working.
      if (r.battery < BATTERY.low) {
        const charger = this.chooseCharger(r);
        if (charger) {
          this.occupiedChargers.add(charger.id);
          r.chargerId = charger.id;
          r.phase = 'to_charger';
          r.task = null;
          r.carrying = false;
          r.elevatorId = null;
          r.targetFloor = null;
          r.dest = null;
          continue;
        }
        // No free charger right now; take work and retry charging later.
      }

      r.task = this.makeTask();
      r.phase = 'to_pickup';
      r.carrying = false;
      r.elevatorId = null;
      r.targetFloor = null;
      r.dest = null;
    }
  }

  /** Nearest free charger on the robot's current floor, or null. */
  private chooseCharger(r: Robot): Station | null {
    let best: Station | null = null;
    let bestD = Infinity;
    for (const c of this.chargers) {
      if (c.floor !== r.floor || this.occupiedChargers.has(c.id)) continue;
      const d = manhattan(r.x, r.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private makeTask(): Task {
    const pickup = this.rng.pick(this.pickups);
    let dropoff = this.rng.pick(this.dropoffs);
    // Avoid the degenerate same-cell task.
    if (dropoff.floor === pickup.floor && dropoff.x === pickup.x && dropoff.y === pickup.y) {
      dropoff = this.rng.pick(this.dropoffs);
    }
    return {
      id: this.nextTaskId++,
      pickup: { floor: pickup.floor, x: pickup.x, y: pickup.y },
      dropoff: { floor: dropoff.floor, x: dropoff.x, y: dropoff.y },
      createdTick: this.tick,
    };
  }

  private legTarget(r: Robot): Cell3 {
    return r.carrying ? r.task!.dropoff : r.task!.pickup;
  }

  private resolveDestinations(): void {
    for (const r of this.robots) {
      if (r.phase === 'to_charger') {
        // Chargers are always on the robot's current floor (chosen that way).
        const c = r.chargerId != null ? this.chargerById.get(r.chargerId) : undefined;
        r.dest = c ? { floor: c.floor, x: c.x, y: c.y } : null;
        continue;
      }
      if (r.phase !== 'to_pickup' && r.phase !== 'to_dropoff') {
        r.dest = null;
        continue;
      }
      const target = this.legTarget(r);
      if (r.floor === target.floor) {
        r.dest = { floor: r.floor, x: target.x, y: target.y };
        r.elevatorId = null;
      } else {
        if (r.elevatorId == null) r.elevatorId = this.chooseElevator(r);
        const el = this.controllerById.get(r.elevatorId)!.cfg;
        r.dest = { floor: r.floor, x: el.inCell.x, y: el.inCell.y };
        r.targetFloor = target.floor;
      }
    }
  }

  private chooseElevator(r: Robot): number {
    let bestId = this.world.elevators[0].id;
    let best = Infinity;
    for (const e of this.world.elevators) {
      const d = manhattan(r.x, r.y, e.inCell.x, e.inCell.y);
      if (d < best) {
        best = d;
        bestId = e.id;
      }
    }
    return bestId;
  }

  private stepElevators(): void {
    const occ = this.occupancy();
    for (const ctrl of this.controllers) {
      const id = ctrl.cfg.id;
      const boarders = new Map<number, Robot>();
      for (const r of this.robots) {
        if (r.phase === 'awaiting_elevator' && r.elevatorId === id) boarders.set(r.floor, r);
      }
      ctrl.step({
        callFloors: new Set(boarders.keys()),
        boarder: (floor) => {
          const r = boarders.get(floor);
          return r ? { robotId: r.id, targetFloor: r.targetFloor! } : undefined;
        },
        onBoard: (robotId) => {
          const r = this.byId.get(robotId)!;
          occ.delete(cellKey(r.floor, r.x, r.y));
          r.phase = 'riding';
          r.dest = null;
          r.yielding = false;
        },
        onUnload: (robotId, floor) => {
          const r = this.byId.get(robotId)!;
          const grid = this.world.floors[floor];
          const oc = ctrl.cfg.outCell;
          // Prefer the exit pad, but fall back to a nearby free cell so a rider
          // is never trapped aboard if the pad is momentarily occupied.
          const candidates = [
            oc,
            { x: oc.x + 1, y: oc.y },
            { x: oc.x, y: oc.y + 1 },
            { x: oc.x, y: oc.y - 1 },
          ];
          let spot: { x: number; y: number } | null = null;
          for (const c of candidates) {
            if (!isWalkable(grid, c.x, c.y)) continue;
            if (c.x === ctrl.cfg.inCell.x && c.y === ctrl.cfg.inCell.y) continue;
            if (occ.has(cellKey(floor, c.x, c.y))) continue;
            spot = c;
            break;
          }
          if (!spot) return false;
          occ.set(cellKey(floor, spot.x, spot.y), robotId);
          r.floor = floor;
          r.x = spot.x;
          r.y = spot.y;
          r.phase = r.carrying ? 'to_dropoff' : 'to_pickup';
          r.elevatorId = null;
          r.targetFloor = null;
          r.dest = null;
          return true;
        },
      });
    }
  }

  private planAndMove(): void {
    const navigating: Robot[] = [];
    const statics: StaticObstacle[] = [];
    for (const r of this.robots) {
      if (r.phase === 'riding') continue;
      const navigates =
        r.phase === 'to_pickup' || r.phase === 'to_dropoff' || r.phase === 'to_charger';
      if (navigates && r.dest) {
        navigating.push(r);
      } else {
        statics.push({ floor: r.floor, x: r.x, y: r.y });
      }
    }

    // During recovery, force shuffled-priority prioritized planning to break the
    // deadlock; otherwise use the selected planner.
    if (this.recoveryTicks > 0) {
      planMoves(this.world, navigating, statics, this.cache, this.opts.planWindow, this.recoverySalt);
      this.recoveryTicks--;
    } else {
      const plan = this.plannerKind === 'cbs' ? planMovesCBS : planMoves;
      plan(this.world, navigating, statics, this.cache, this.opts.planWindow);
    }

    let moved = 0;
    for (const r of navigating) {
      if (r.nextX !== r.x || r.nextY !== r.y) {
        moved++;
        r.moveTicks++;
        r.x = r.nextX;
        r.y = r.nextY;
      } else if (r.yielding) {
        r.waitTicks++;
      }
    }
    for (const r of this.robots) {
      if (r.phase === 'awaiting_elevator') r.waitTicks++;
    }

    // Deadlock detection: navigating robots present but nobody moved.
    if (navigating.length > 0 && moved === 0) this.stallTicks++;
    else this.stallTicks = 0;

    if (this.stallTicks >= STALL_THRESHOLD && this.recoveryTicks === 0) {
      this.recoveryTicks = RECOVERY_DURATION;
      this.recoverySalt++;
      this.totalDeadlocks++;
      this.stallTicks = 0;
    }
  }

  private handleArrivals(): void {
    for (const r of this.robots) {
      if (r.phase === 'to_charger') {
        if (r.dest && r.x === r.dest.x && r.y === r.dest.y) {
          r.phase = 'charging';
          r.dest = null;
        }
        continue;
      }
      if (r.phase !== 'to_pickup' && r.phase !== 'to_dropoff') continue;
      if (!r.dest) continue;
      if (r.x !== r.dest.x || r.y !== r.dest.y) continue;

      const target = this.legTarget(r);
      const atLegTarget = r.floor === target.floor && r.dest.x === target.x && r.dest.y === target.y;
      if (atLegTarget) {
        if (!r.carrying) {
          r.phase = 'loading';
          r.dwell = this.opts.loadTicks;
        } else {
          r.phase = 'unloading';
          r.dwell = this.opts.unloadTicks;
        }
      } else {
        // Reached the elevator boarding pad.
        r.phase = 'awaiting_elevator';
      }
      r.dest = null;
    }
  }

  /** Drain battery for every active (non-charging) robot. */
  private updateBattery(): void {
    for (const r of this.robots) {
      if (r.phase === 'charging') continue;
      let drain: number = BATTERY.drainIdle;
      if (r.phase === 'to_pickup' || r.phase === 'to_dropoff' || r.phase === 'to_charger') {
        drain = r.carrying ? BATTERY.drainCarry : BATTERY.drainMove;
      }
      r.battery = Math.max(0, r.battery - drain);
    }
  }

  /**
   * Decay the congestion field and add the current footprint. Waiting/yielding
   * robots deposit much more heat than moving ones, so hotspots mark where the
   * fleet actually stalls (elevator queues, pinch points).
   */
  private updateHeat(): void {
    const W = this.world.width;
    for (const field of this.heat) {
      for (let i = 0; i < field.length; i++) field[i] *= 0.985;
    }
    for (const r of this.robots) {
      if (r.phase === 'riding') continue;
      const field = this.heat[r.floor];
      field[r.y * W + r.x] += r.yielding || r.phase === 'awaiting_elevator' ? 1 : 0.05;
    }
  }

  // ---- metrics ------------------------------------------------------------

  private updateThroughput(): void {
    const windowTicks = Math.max(1, Math.round(60 / this.opts.tickSeconds));
    const cutoff = this.tick - windowTicks;
    while (this.deliveryTicks.length && this.deliveryTicks[0] <= cutoff) {
      this.deliveryTicks.shift();
    }
    // Deliveries per simulated minute over the trailing window.
    this.throughput = this.deliveryTicks.length;
  }

  private computeMetrics(): Metrics {
    const n = this.robots.length || 1;
    let moving = 0;
    let waiting = 0;
    let totalWait = 0;
    let totalBattery = 0;
    for (const r of this.robots) {
      totalWait += r.waitTicks;
      totalBattery += r.battery;
      const navigating = r.phase === 'to_pickup' || r.phase === 'to_dropoff';
      if (navigating && !r.yielding) moving++;
      if (r.yielding || r.phase === 'awaiting_elevator') waiting++;
    }
    let elevatorLoad = 0;
    for (const c of this.controllers) elevatorLoad += c.riderCount / c.cfg.capacity;
    const elevatorUtilization = this.controllers.length
      ? elevatorLoad / this.controllers.length
      : 0;

    return {
      tick: this.tick,
      deliveries: this.totalDeliveries,
      throughput: this.throughput,
      utilization: moving / n,
      congestion: waiting / n,
      elevatorUtilization,
      avgWaitPerDelivery: totalWait / Math.max(1, this.totalDeliveries),
      avgBattery: totalBattery / n,
      deadlocksResolved: this.totalDeadlocks,
    };
  }

  // ---- helpers ------------------------------------------------------------

  private occupancy(): Map<string, number> {
    const occ = new Map<string, number>();
    for (const r of this.robots) {
      if (r.phase === 'riding') continue;
      occ.set(cellKey(r.floor, r.x, r.y), r.id);
    }
    return occ;
  }

  private queuedFor(elevatorId: number): number {
    let q = 0;
    for (const r of this.robots) {
      if (r.elevatorId === elevatorId && r.phase === 'awaiting_elevator') q++;
    }
    return q;
  }

  private robotSnapshot(r: Robot): RobotSnapshot {
    let ride = r.floor;
    let x = r.x;
    let y = r.y;
    let floor = r.floor;
    if (r.phase === 'riding' && r.elevatorId != null) {
      const c = this.controllerById.get(r.elevatorId)!;
      ride = c.floorPos;
      floor = Math.round(c.floorPos);
      x = c.cfg.x;
      y = c.cfg.y;
    }
    const navigating =
      r.phase === 'to_pickup' || r.phase === 'to_dropoff' || r.phase === 'to_charger';
    return {
      id: r.id,
      kind: r.kind,
      floor,
      x,
      y,
      phase: r.phase,
      carrying: r.carrying,
      yielding: r.yielding,
      ride,
      battery: r.battery,
      path: navigating ? r.plannedPath.map((p) => ({ x: p.x, y: p.y })) : [],
      pickup: r.task ? r.task.pickup : null,
      dropoff: r.task ? r.task.dropoff : null,
    };
  }

  private computeSpawnCells(): Cell3[] {
    // Spread spawn points across all floors' free cells, excluding stations, so
    // the fleet starts distributed rather than piled on one tile.
    const taken = new Set<string>();
    for (const s of this.world.stations) taken.add(cellKey(s.floor, s.x, s.y));

    const cells: Cell3[] = [];
    for (const grid of this.world.floors) {
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (grid.cells[y * grid.width + x] !== 0) continue; // Cell.Free === 0
          if (taken.has(cellKey(grid.floor, x, y))) continue;
          cells.push({ floor: grid.floor, x, y });
        }
      }
    }
    // Deterministic shuffle so the fleet is scattered but reproducible.
    for (let i = cells.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells;
  }
}

function cellKey(floor: number, x: number, y: number): string {
  return `${floor}|${x}|${y}`;
}
