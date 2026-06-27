/**
 * World generators for the two selectable construction sites.
 *
 *  - "apartment": a tall, narrow high-rise. Materials are staged in a ground
 *    yard and installed on the upper floors, so nearly every job crosses
 *    floors — the elevators become the dominant bottleneck.
 *  - "factory": a wide, shorter building. Inbound docks feed assembly stations
 *    spread across every floor, mixing busy on-floor traffic with elevator use.
 *
 * Both share the same engine; only the layout, station mix, and defaults differ.
 */

import { DIRS, idx } from './grid';
import { Cell, Elevator, FloorGrid, Obstacle, ScenarioId, Station, World } from './types';

export interface ScenarioParams {
  scenario: ScenarioId;
  numFloors: number;
  width: number;
  height: number;
  elevatorCount: number;
  elevatorCapacity: number;
  travelTicksPerFloor: number;
  doorTicks: number;
}

export const DEFAULT_PARAMS: Record<ScenarioId, ScenarioParams> = {
  apartment: {
    scenario: 'apartment',
    numFloors: 6,
    width: 24,
    height: 18,
    elevatorCount: 2,
    elevatorCapacity: 2,
    travelTicksPerFloor: 3,
    doorTicks: 3,
  },
  factory: {
    scenario: 'factory',
    numFloors: 3,
    width: 30,
    height: 22,
    elevatorCount: 3,
    elevatorCapacity: 3,
    travelTicksPerFloor: 3,
    doorTicks: 3,
  },
  warehouse: {
    scenario: 'warehouse',
    numFloors: 2,
    width: 36,
    height: 26,
    elevatorCount: 2,
    elevatorCapacity: 3,
    travelTicksPerFloor: 3,
    doorTicks: 3,
  },
};

/** Allowed ranges for the live controls. */
export const PARAM_BOUNDS = {
  numFloors: { min: 2, max: 10 },
  width: { min: 16, max: 40 },
  height: { min: 12, max: 30 },
  elevatorCount: { min: 1, max: 4 },
  elevatorCapacity: { min: 1, max: 6 },
  robotCount: { min: 1, max: 24 },
};

export function buildWorld(p: ScenarioParams): World {
  const { numFloors, width, height } = p;
  const floors: FloorGrid[] = [];
  for (let f = 0; f < numFloors; f++) {
    floors.push({
      floor: f,
      width,
      height,
      cells: new Uint8Array(width * height),
      obstacles: new Uint8Array(width * height),
    });
  }

  if (p.scenario === 'apartment') addColumns(floors, 6, 5);
  else if (p.scenario === 'factory') addMachineBlocks(floors, 8, 6);
  else addRacks(floors);

  const elevators = addElevators(floors, p);
  const base =
    p.scenario === 'apartment'
      ? apartmentStations(floors)
      : p.scenario === 'factory'
        ? factoryStations(floors)
        : warehouseStations(floors);
  const stations = base.concat(addChargers(floors, base.length));

  // Make sure every station sits on a clear, walkable cell.
  for (const s of stations) {
    const i = idx(s.x, s.y, width);
    floors[s.floor].cells[i] = Cell.Free;
    floors[s.floor].obstacles![i] = Obstacle.None;
  }

  // Scatter varied site clutter the fleet must weave around — staged flooring
  // pallets, safety barriers, scaffolding, and crates — keeping every floor
  // fully connected so all stations and elevator pads stay reachable.
  addSiteClutter(floors, elevators, stations);

  return { scenario: p.scenario, numFloors, width, height, floors, elevators, stations };
}

// ---- structure ------------------------------------------------------------

/** Mark a cell as an impassable wall and tag its visual obstacle kind. */
function setWall(g: FloorGrid, x: number, y: number, kind: Obstacle): void {
  const i = idx(x, y, g.width);
  g.cells[i] = Cell.Wall;
  if (g.obstacles) g.obstacles[i] = kind;
}

/** Regular structural columns the robots must weave around (high-rise look). */
function addColumns(floors: FloorGrid[], stepX: number, stepY: number): void {
  for (const g of floors) {
    for (let y = 3; y < g.height - 1; y += stepY) {
      for (let x = 2; x < g.width - 1; x += stepX) {
        setWall(g, x, y, Obstacle.Pillar);
      }
    }
  }
}

/** Larger machine footprints for the factory floors. */
function addMachineBlocks(floors: FloorGrid[], stepX: number, stepY: number): void {
  for (const g of floors) {
    for (let y = 4; y < g.height - 2; y += stepY) {
      for (let x = 3; x < g.width - 3; x += stepX) {
        setWall(g, x, y, Obstacle.Machine);
        setWall(g, x + 1, y, Obstacle.Machine);
      }
    }
  }
}

/**
 * Long storage-rack rows for the warehouse, leaving travel aisles between rows
 * and periodic cross-aisle gaps so the floor stays fully connected.
 */
function addRacks(floors: FloorGrid[]): void {
  for (const g of floors) {
    for (let y = 4; y < g.height - 4; y += 3) {
      for (let x = 3; x < g.width - 3; x++) {
        if (x % 8 === 0) continue; // cross-aisle gap
        setWall(g, x, y, Obstacle.Rack);
      }
    }
  }
}

/**
 * Place evenly spaced elevator shafts along the building core (rows y = 0,1).
 *
 * The shaft sits between the boarding pad (left) and the exit pad (right), so
 * the boarding queue forms on the opposite side from where riders step out and
 * can never block an exit — which would otherwise deadlock a full car.
 */
function addElevators(floors: FloorGrid[], p: ScenarioParams): Elevator[] {
  const width = p.width;
  const xs = spread(p.elevatorCount, 3, width - 4);
  const elevators: Elevator[] = [];

  xs.forEach((sx, i) => {
    const inCell = { x: sx - 1, y: 1 };
    const outCell = { x: sx + 1, y: 1 };
    for (const g of floors) {
      g.cells[idx(sx, 0, width)] = Cell.Wall; // shaft column (upper)
      g.cells[idx(sx, 1, width)] = Cell.Wall; // shaft column (lower)
      g.cells[idx(inCell.x, inCell.y, width)] = Cell.ElevatorIn;
      g.cells[idx(outCell.x, outCell.y, width)] = Cell.ElevatorOut;
    }
    elevators.push({
      id: i,
      x: sx,
      y: 0,
      inCell,
      outCell,
      floors: floors.map((g) => g.floor),
      capacity: p.elevatorCapacity,
      travelTicksPerFloor: p.travelTicksPerFloor,
      doorTicks: p.doorTicks,
    });
  });

  return elevators;
}

// ---- stations -------------------------------------------------------------

function apartmentStations(floors: FloorGrid[]): Station[] {
  const stations: Station[] = [];
  let id = 0;
  const ground = floors[0];

  // Material yard along the back of the ground floor.
  for (const c of lattice(ground, 3, ground.width - 3, ground.height - 4, ground.height - 2, 3, 2)) {
    stations.push({ id: id++, role: 'pickup', label: 'material-yard', ...c, floor: 0 });
  }

  // Install points scattered across each upper floor.
  for (let f = 1; f < floors.length; f++) {
    const g = floors[f];
    for (const c of lattice(g, 3, g.width - 3, 3, g.height - 3, 7, 6)) {
      stations.push({ id: id++, role: 'dropoff', label: 'install-zone', ...c, floor: f });
    }
  }
  return stations;
}

function factoryStations(floors: FloorGrid[]): Station[] {
  const stations: Station[] = [];
  let id = 0;
  const ground = floors[0];

  // Inbound docks along the back of the ground floor.
  for (const c of lattice(ground, 3, ground.width - 3, ground.height - 3, ground.height - 2, 4, 1)) {
    stations.push({ id: id++, role: 'pickup', label: 'inbound-dock', ...c, floor: 0 });
  }

  // Assembly stations on every floor (including the ground floor).
  for (let f = 0; f < floors.length; f++) {
    const g = floors[f];
    const y1 = f === 0 ? g.height - 6 : g.height - 3;
    for (const c of lattice(g, 4, g.width - 4, 3, y1, 6, 4)) {
      stations.push({ id: id++, role: 'dropoff', label: 'assembly-station', ...c, floor: f });
    }
  }
  return stations;
}

function warehouseStations(floors: FloorGrid[]): Station[] {
  const stations: Station[] = [];
  let id = 0;

  // Storage pick faces in the aisle just below each rack row, on every floor.
  for (const g of floors) {
    for (let y = 5; y < g.height - 4; y += 3) {
      for (let x = 4; x < g.width - 4; x += 5) {
        stations.push({ id: id++, role: 'pickup', label: 'storage', x, y, floor: g.floor });
      }
    }
  }

  // Packing / shipping docks along the front of the ground floor.
  const ground = floors[0];
  for (const c of lattice(ground, 4, ground.width - 4, ground.height - 3, ground.height - 2, 3, 1)) {
    stations.push({ id: id++, role: 'dropoff', label: 'packing', ...c, floor: 0 });
  }
  return stations;
}

/** Two charging stations per floor, on the side edges, clear of the core. */
function addChargers(floors: FloorGrid[], startId: number): Station[] {
  const chargers: Station[] = [];
  let id = startId;
  for (const g of floors) {
    const y = Math.floor(g.height / 2);
    for (const x of [1, g.width - 2]) {
      chargers.push({ id: id++, role: 'charger', label: 'charger', x, y, floor: g.floor });
    }
  }
  return chargers;
}

// ---- helpers --------------------------------------------------------------

/** Evenly spaced integer positions in [lo, hi]. */
function spread(n: number, lo: number, hi: number): number[] {
  if (n <= 1) return [Math.round((lo + hi) / 2)];
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(lo + step * i));
}

/** Free cells on a lattice within a region, used to scatter stations. */
function lattice(
  g: FloorGrid,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  stepX: number,
  stepY: number,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
      out.push({ x, y });
    }
  }
  return out;
}

// ---- site clutter ---------------------------------------------------------

/**
 * Mix of loose obstacles scattered on every floor. Pallets are weighted highest
 * because the fleet's job is hauling flooring — staged bundles read as the work
 * in progress.
 */
const CLUTTER_KINDS: readonly Obstacle[] = [
  Obstacle.Pallet,
  Obstacle.Pallet,
  Obstacle.Crate,
  Obstacle.Barrier,
  Obstacle.Scaffold,
];

/** Fraction of a floor's eligible free cells turned into scattered clutter. */
const CLUTTER_RATE = 0.05;

/**
 * Scatter a variety of impassable props across each floor so robots are seen
 * carefully threading around them. Every prop is a normal `Cell.Wall` to the
 * planner; only its {@link Obstacle} tag (for the renderer) differs.
 *
 * Placement is deterministic (a coordinate hash, no RNG) and guarded: a prop is
 * only kept if it severs nothing — i.e. the count of cells reachable from a
 * fixed anchor drops by exactly one — so the floor stays a single connected
 * region and no station or elevator pad is ever walled off.
 */
function addSiteClutter(floors: FloorGrid[], elevators: Elevator[], stations: Station[]): void {
  if (elevators.length === 0) return;
  const anchor = elevators[0].inCell;

  for (const g of floors) {
    const { width, height } = g;
    const obs = g.obstacles!;

    // Cells to leave clear: stations, elevator pads/shafts, and a one-cell
    // buffer around each so their approaches never get crowded.
    const forbidden = new Set<number>();
    const guard = (cx: number, cy: number) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < width && y < height) forbidden.add(idx(x, y, width));
        }
      }
    };
    for (const s of stations) if (s.floor === g.floor) guard(s.x, s.y);
    for (const e of elevators) {
      guard(e.inCell.x, e.inCell.y);
      guard(e.outCell.x, e.outCell.y);
    }

    // Candidate free interior cells (skipping the elevator core band at the top
    // two rows), ordered by a stable hash for a reproducible scatter.
    const candidates: Array<{ i: number; x: number; y: number; h: number }> = [];
    for (let y = 2; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idx(x, y, width);
        if (g.cells[i] !== Cell.Free || forbidden.has(i)) continue;
        candidates.push({ i, x, y, h: hash3(x, y, g.floor) });
      }
    }
    candidates.sort((a, b) => a.h - b.h);

    const target = Math.round(candidates.length * CLUTTER_RATE);
    let reachable = floodCount(g, anchor.x, anchor.y);
    let placed = 0;
    for (const c of candidates) {
      if (placed >= target) break;
      g.cells[c.i] = Cell.Wall;
      const after = floodCount(g, anchor.x, anchor.y);
      if (after === reachable - 1) {
        obs[c.i] = CLUTTER_KINDS[c.h % CLUTTER_KINDS.length];
        reachable = after;
        placed++;
      } else {
        g.cells[c.i] = Cell.Free; // would sever the floor — revert
      }
    }
  }
}

/** Number of walkable cells reachable from (sx, sy) on a floor (flood fill). */
function floodCount(g: FloorGrid, sx: number, sy: number): number {
  const { width, height, cells } = g;
  const start = idx(sx, sy, width);
  if (cells[start] === Cell.Wall) return 0;
  const seen = new Uint8Array(width * height);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length > 0) {
    const cur = stack.pop()!;
    count++;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = idx(nx, ny, width);
      if (seen[ni] || cells[ni] === Cell.Wall) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return count;
}

/** Stable 32-bit hash of a floor cell — a deterministic stand-in for an RNG. */
function hash3(x: number, y: number, f: number): number {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663) ^ Math.imul(f + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
