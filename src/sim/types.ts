/**
 * Core domain types for the multi-agent path-finding (MAPF) fleet simulator.
 *
 * The world is a stack of 2D floor grids connected by elevators. Robots carry
 * materials between stations, planning collision-free paths on each floor and
 * queueing for elevators to move between floors.
 */

/** Cell occupancy on a single floor grid. Stored packed in a Uint8Array. */
export enum Cell {
  /** Walkable empty space. */
  Free = 0,
  /** Permanent obstacle (structure, machinery, shaft wall). */
  Wall = 1,
  /** Walkable boarding pad in front of an elevator shaft. */
  ElevatorIn = 2,
  /** Walkable exit pad next to an elevator shaft. */
  ElevatorOut = 3,
}

/** A coordinate within a single floor grid. */
export interface Coord {
  x: number;
  y: number;
}

/** A coordinate in the full building (floor + position). */
export interface Cell3 extends Coord {
  floor: number;
}

/** A single floor's occupancy grid. */
export interface FloorGrid {
  floor: number;
  width: number;
  height: number;
  /** Row-major Cell values, length = width * height. */
  cells: Uint8Array;
}

export type StationRole = 'pickup' | 'dropoff' | 'charger';

/**
 * A pickup or dropoff point. Robots drive onto a station cell, dwell briefly to
 * load/unload, then continue. Stations sit on otherwise walkable cells.
 */
export interface Station extends Cell3 {
  id: number;
  role: StationRole;
  /** Human-readable group, e.g. "material-yard" or "install-zone". */
  label: string;
}

/**
 * A vertical transport serving a set of floors. It occupies a shaft column and
 * exposes a boarding pad (in) and exit pad (out) on each served floor.
 */
export interface Elevator {
  id: number;
  /** Shaft column position, shared across all served floors. */
  x: number;
  y: number;
  /** Boarding pad cell, where robots wait and step in. */
  inCell: Coord;
  /** Exit pad cell, where riders step out. */
  outCell: Coord;
  /** Sorted ascending list of floors this elevator serves. */
  floors: number[];
  /** Maximum robots that can ride at once. */
  capacity: number;
  /** Ticks to travel one floor. */
  travelTicksPerFloor: number;
  /** Ticks doors stay open at a stop for loading/unloading. */
  doorTicks: number;
}

export type ScenarioId = 'apartment' | 'factory' | 'warehouse';

/** A fully built, immutable world the engine simulates against. */
export interface World {
  scenario: ScenarioId;
  numFloors: number;
  width: number;
  height: number;
  floors: FloorGrid[];
  elevators: Elevator[];
  stations: Station[];
}

export type RobotKind = 'forklift' | 'cart' | 'lifter' | 'scout';

/**
 * Robot lifecycle. A task is the round-trip "fetch from pickup, deliver to
 * dropoff"; the phases below track where the robot is within that round-trip.
 */
export type RobotPhase =
  | 'idle' // no task; parked
  | 'to_pickup' // navigating toward the pickup (this floor or via elevator)
  | 'loading' // dwelling at the pickup
  | 'to_dropoff' // navigating toward the dropoff
  | 'unloading' // dwelling at the dropoff
  | 'awaiting_elevator' // standing on a boarding pad, waiting for a car
  | 'riding' // inside an elevator car between floors
  | 'to_charger' // battery low; heading to a charging station
  | 'charging'; // parked on a charger, recharging

/** A delivery job: move one unit of material from a pickup to a dropoff. */
export interface Task {
  id: number;
  pickup: Cell3;
  dropoff: Cell3;
  /** Tick the task was created (for lead-time metrics). */
  createdTick: number;
}

export interface Robot {
  id: number;
  kind: RobotKind;

  // Position in the building.
  floor: number;
  x: number;
  y: number;

  phase: RobotPhase;
  carrying: boolean;
  task: Task | null;

  /**
   * Immediate single-floor destination for the current leg. When the final
   * target is on another floor this points at the chosen elevator's boarding
   * pad; otherwise it is the pickup/dropoff cell.
   */
  dest: Cell3 | null;

  /** Planned next step decided by the planner this tick: where to move to. */
  nextX: number;
  nextY: number;

  /** True when the robot chose to hold position to let others pass. */
  yielding: boolean;

  // Elevator interaction state.
  elevatorId: number | null;
  /** Floor the robot wants to reach when it boards. */
  targetFloor: number | null;

  /** Remaining dwell ticks for loading/unloading. */
  dwell: number;

  /** Battery charge in [0, 1]. */
  battery: number;
  /** Station id of the charger this robot has claimed, or null. */
  chargerId: number | null;

  /** Most recent planned path on the current floor (for visualization). */
  plannedPath: Coord[];

  // Per-robot statistics.
  deliveries: number;
  waitTicks: number;
  moveTicks: number;
}

/** Lightweight, render-friendly snapshot the UI consumes each frame. */
export interface RobotSnapshot {
  id: number;
  kind: RobotKind;
  floor: number;
  x: number;
  y: number;
  phase: RobotPhase;
  carrying: boolean;
  yielding: boolean;
  /** Continuous riding progress (0..1) used to animate elevator travel. */
  ride: number;
  /** Battery charge in [0, 1]. */
  battery: number;
  /** Planned path on the current floor (empty unless navigating). */
  path: Coord[];
  /** Current task endpoints, if any (for the inspector). */
  pickup: Cell3 | null;
  dropoff: Cell3 | null;
}

export interface ElevatorSnapshot {
  id: number;
  x: number;
  y: number;
  /** Continuous floor position (e.g. 2.4 while moving between floors 2 and 3). */
  floorPos: number;
  riders: number;
  capacity: number;
  doorsOpen: boolean;
  queued: number;
}

export interface Metrics {
  tick: number;
  /** Completed deliveries since the run started. */
  deliveries: number;
  /** Exponentially smoothed deliveries per minute of simulated time. */
  throughput: number;
  /** Fraction of robots currently moving (0..1). */
  utilization: number;
  /** Fraction of robots currently waiting/yielding (0..1). */
  congestion: number;
  /** Average elevator car occupancy as a fraction of capacity (0..1). */
  elevatorUtilization: number;
  /** Average ticks a robot has spent waiting per delivery. */
  avgWaitPerDelivery: number;
  /** Mean battery charge across the fleet (0..1). */
  avgBattery: number;
}
