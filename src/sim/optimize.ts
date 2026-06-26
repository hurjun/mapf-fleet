/**
 * Fleet-size optimizer.
 *
 * Question: for a given building (floors, grid size, number of elevators,
 * elevator capacity), how many robots should we deploy? Too few and the site is
 * under-served; too many and they congest the floors and pile up at the
 * elevators, so throughput stops improving (or even drops) while cost keeps
 * rising. We want the smallest fleet that captures essentially all the
 * achievable throughput — the "knee" of the throughput-vs-fleet-size curve.
 *
 * The model below is a first-order analytical estimate, derived from the actual
 * generated layout (it builds the world to measure real travel distances and
 * free space rather than guessing). It is intentionally transparent: every
 * assumption is named in a comment. The running simulation reports the *actual*
 * throughput, so the UI can overlay measured points on top of this prediction
 * — model vs. reality, side by side.
 *
 * ── Derivation ────────────────────────────────────────────────────────────
 *
 * 1. Cycle time of one robot, uncongested (ticks per delivery):
 *
 *        Tc0 = floorTravel + elevatorTime + dwell
 *
 *    where floorTravel is the on-floor walking per delivery, elevatorTime is the
 *    time spent riding between floors, and dwell is the load + unload time.
 *
 * 2. Throughput in the *floor-limited* regime grows with the fleet, but each
 *    robot slows as the floors fill up (a traffic "fundamental diagram"):
 *
 *        speed(ρ) = max(speedMin, 1 − ρ / ρ_jam),     ρ = N / freeCells
 *        Tc(N)    = floorTravel / speed(ρ) + elevatorTime + dwell
 *        floorThroughput(N) = N / Tc(N)
 *
 * 3. The elevators impose a hard ceiling. A car serves ~2·capacity boardings
 *    per round trip (a load going up and a load coming down), so:
 *
 *        elevatorCeiling = (E · 2·capacity / roundTrip) / boardingsPerDelivery
 *
 * 4. Actual throughput is the smaller of the two:
 *
 *        T(N) = min( floorThroughput(N), elevatorCeiling )
 *
 *    Sweeping N gives the curve; its peak is the best fleet and the binding term
 *    tells us whether the site is elevator-bound or congestion-bound.
 */

import { BATTERY } from './engine';
import { distanceField, idx } from './grid';
import { buildWorld, ScenarioParams } from './scenarios';
import { Station, World } from './types';

export interface OptimizeInput {
  params: ScenarioParams;
  loadTicks: number;
  unloadTicks: number;
  tickSeconds: number;
  maxRobots: number;
}

export interface ThroughputPoint {
  robots: number;
  /** Predicted deliveries per simulated minute. */
  throughput: number;
}

export type Bottleneck = 'elevators' | 'congestion' | 'balanced';

export interface OptimizeResult {
  curve: ThroughputPoint[];
  /** Fleet size that maximizes predicted throughput. */
  best: number;
  /** Smallest fleet within 95% of the peak — the recommended deployment. */
  recommended: number;
  /** Predicted deliveries per minute at the peak. */
  maxThroughput: number;
  /** What limits the site at the peak. */
  bottleneck: Bottleneck;
  /** Elevator throughput ceiling, deliveries per minute. */
  elevatorCeiling: number;
  /** Uncongested cycle time per delivery, in ticks (for display). */
  cycleTicks: number;
  /** Average on-floor distance from a pickup to its nearest elevator (cells). */
  pickupToElevator: number;
  /** Average on-floor distance from a dropoff to its nearest elevator (cells). */
  dropoffToElevator: number;
}

// Tunable constants of the traffic model.
const JAM_DENSITY = 0.55; // robots-per-free-cell at which floors gridlock
const MIN_SPEED = 0.15; // floors never slow below this fraction of free speed

export function optimizeFleet(input: OptimizeInput): OptimizeResult {
  const { params, loadTicks, unloadTicks, tickSeconds, maxRobots } = input;
  const world = buildWorld(params);

  const pickups = world.stations.filter((s) => s.role === 'pickup');
  const dropoffs = world.stations.filter((s) => s.role === 'dropoff');

  const freeCells = countFreeCells(world);
  const pickupToElevator = avgDistanceToElevator(world, pickups);
  const dropoffToElevator = avgDistanceToElevator(world, dropoffs);

  // On-floor walking per steady-state delivery: the robot ends a delivery near
  // a dropoff, walks to an elevator, rides to the pickup floor, walks to the
  // pickup and back to the elevator, rides to the dropoff floor, then walks to
  // the dropoff — i.e. two pickup-legs and two dropoff-legs.
  const floorTravel = 2 * (pickupToElevator + dropoffToElevator);

  // Pickups sit on the ground floor, so a job crosses floors whenever its
  // dropoff is above ground. `crossFraction` is how often that happens, and
  // `meanCrossFloor` is the average number of floors such a ride spans.
  const crossDropoffs = dropoffs.filter((s) => s.floor !== 0);
  const crossFraction = dropoffs.length ? crossDropoffs.length / dropoffs.length : 0;
  const meanCrossFloor = crossDropoffs.length
    ? crossDropoffs.reduce((sum, s) => sum + s.floor, 0) / crossDropoffs.length
    : 0;

  // Two boardings per cross-floor delivery (down to the pickup floor, then up to
  // the dropoff floor); each ride costs travel plus a door cycle at both ends.
  const boardingsPerDelivery = 2 * crossFraction;
  const rideTicksPerBoarding =
    meanCrossFloor * params.travelTicksPerFloor + 2 * params.doorTicks;
  const elevatorTime = boardingsPerDelivery * rideTicksPerBoarding;

  const dwell = loadTicks + unloadTicks;
  const cycleTicks = floorTravel + elevatorTime + dwell;

  // Elevator capacity ceiling (deliveries per tick). A round trip spans the
  // typical ride height twice and pauses for a door cycle per rider boarded.
  const roundTrip =
    2 * Math.max(1, meanCrossFloor) * params.travelTicksPerFloor +
    2 * params.elevatorCapacity * params.doorTicks;
  const elevatorCeilingPerTick =
    boardingsPerDelivery > 0
      ? (params.elevatorCount * 2 * params.elevatorCapacity) / roundTrip / boardingsPerDelivery
      : Infinity;

  const perMinute = 60 / tickSeconds;

  // Charging duty cycle: a robot works while draining from full to the low
  // threshold, then sits out while recharging. `availability` is the fraction
  // of time it is actually productive — it scales the whole curve down so the
  // model lines up with the (charging-aware) simulation.
  const usable = 1 - BATTERY.low;
  const drainActive = (BATTERY.drainMove + BATTERY.drainCarry) / 2;
  const activeTicks = usable / drainActive;
  const chargeTicks = usable / BATTERY.charge;
  const availability = activeTicks / (activeTicks + chargeTicks);

  const floorThroughputPerTick = (n: number): number => {
    const density = n / Math.max(1, freeCells);
    const speed = Math.max(MIN_SPEED, 1 - density / JAM_DENSITY);
    const tc = floorTravel / speed + elevatorTime + dwell;
    return n / tc;
  };

  const curve: ThroughputPoint[] = [];
  let best = 1;
  let maxThroughput = 0;
  for (let n = 1; n <= maxRobots; n++) {
    const perTick = Math.min(floorThroughputPerTick(n) * availability, elevatorCeilingPerTick);
    const throughput = perTick * perMinute;
    curve.push({ robots: n, throughput });
    if (throughput > maxThroughput) {
      maxThroughput = throughput;
      best = n;
    }
  }

  // Recommended fleet: the smallest one that already reaches 95% of the peak.
  // Anything beyond it buys < 5% throughput for 100% more robots.
  let recommended = best;
  for (const p of curve) {
    if (p.throughput >= 0.95 * maxThroughput) {
      recommended = p.robots;
      break;
    }
  }

  // Classify the binding constraint at the peak.
  let bottleneck: Bottleneck;
  if (elevatorCeilingPerTick < floorThroughputPerTick(best) * availability * 0.999) {
    bottleneck = 'elevators';
  } else if (best < maxRobots) {
    bottleneck = 'congestion'; // throughput peaked before the slider's max
  } else {
    bottleneck = 'balanced';
  }

  return {
    curve,
    best,
    recommended,
    maxThroughput,
    bottleneck,
    elevatorCeiling: elevatorCeilingPerTick * perMinute,
    cycleTicks,
    pickupToElevator,
    dropoffToElevator,
  };
}

/** Count walkable cells across every floor (the denominator for density). */
function countFreeCells(world: World): number {
  let n = 0;
  for (const g of world.floors) {
    for (let i = 0; i < g.cells.length; i++) if (g.cells[i] === 0) n++; // Cell.Free === 0
  }
  return n;
}

/**
 * Average shortest-path distance from each station to its nearest elevator
 * boarding pad, measured on the real grid with reverse-BFS distance fields.
 */
function avgDistanceToElevator(world: World, stations: Station[]): number {
  const fields = new Map<string, Int32Array>();
  const field = (floor: number, x: number, y: number): Int32Array => {
    const key = `${floor}|${x}|${y}`;
    let f = fields.get(key);
    if (!f) {
      f = distanceField(world.floors[floor], x, y);
      fields.set(key, f);
    }
    return f;
  };

  let sum = 0;
  let count = 0;
  for (const s of stations) {
    let best = Infinity;
    for (const e of world.elevators) {
      const d = field(s.floor, e.inCell.x, e.inCell.y)[idx(s.x, s.y, world.width)];
      if (d >= 0) best = Math.min(best, d);
    }
    if (best < Infinity) {
      sum += best;
      count += 1;
    }
  }
  return count ? sum / count : 0;
}
