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

import { idx } from './grid';
import { Cell, Elevator, FloorGrid, ScenarioId, Station, World } from './types';

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
    floors.push({ floor: f, width, height, cells: new Uint8Array(width * height) });
  }

  if (p.scenario === 'apartment') addColumns(floors, 6, 5);
  else addMachineBlocks(floors, 8, 6);

  const elevators = addElevators(floors, p);
  const stations = p.scenario === 'apartment' ? apartmentStations(floors) : factoryStations(floors);

  // Make sure every station sits on a clear, walkable cell.
  for (const s of stations) floors[s.floor].cells[idx(s.x, s.y, width)] = Cell.Free;

  return { scenario: p.scenario, numFloors, width, height, floors, elevators, stations };
}

// ---- structure ------------------------------------------------------------

/** Regular structural columns the robots must weave around (high-rise look). */
function addColumns(floors: FloorGrid[], stepX: number, stepY: number): void {
  for (const g of floors) {
    for (let y = 3; y < g.height - 1; y += stepY) {
      for (let x = 2; x < g.width - 1; x += stepX) {
        g.cells[idx(x, y, g.width)] = Cell.Wall;
      }
    }
  }
}

/** Larger machine footprints for the factory floors. */
function addMachineBlocks(floors: FloorGrid[], stepX: number, stepY: number): void {
  for (const g of floors) {
    for (let y = 4; y < g.height - 2; y += stepY) {
      for (let x = 3; x < g.width - 3; x += stepX) {
        g.cells[idx(x, y, g.width)] = Cell.Wall;
        g.cells[idx(x + 1, y, g.width)] = Cell.Wall;
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
