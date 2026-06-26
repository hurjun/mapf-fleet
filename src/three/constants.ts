/**
 * Shared constants and color logic for the 3D scene.
 *
 * The world is a stack of 2D grids. We render it as an "exploded" architectural
 * cutaway: each floor is drawn as a translucent slab lifted by FLOOR_GAP, so all
 * levels — and the robots, stations and elevators on them — are visible at once.
 */

import { RobotSnapshot } from '@/sim/types';

/** Size of one grid cell in 3D world units. */
export const CELL = 1;
/** Vertical distance between successive floor planes. */
export const FLOOR_GAP = 3.2;
/** Small lift so robot wheels sit just above the floor slab surface. */
export const ROBOT_Y = 0.1;

/** Map a grid cell on a floor to a centered 3D position (x, height, z). */
export function toScene(
  x: number,
  y: number,
  floorHeight: number,
  width: number,
  height: number,
): [number, number, number] {
  return [(x - (width - 1) / 2) * CELL, floorHeight, (y - (height - 1) / 2) * CELL];
}

/** Vertical height of a (possibly fractional, while riding) floor. */
export function floorHeight(floor: number): number {
  return floor * FLOOR_GAP;
}

/** Palette for the building structure. */
export const COLORS = {
  slab: '#1b2435',
  slabEdge: '#3a4a66',
  column: '#313e56',
  machine: '#3b485f',
  shaft: '#7dd3fc',
  car: '#e2e8f0',
  pickup: '#34d399',
  dropoff: '#60a5fa',
  boardPad: '#fbbf24',
  exitPad: '#fb923c',
  charger: '#22d3ee',
  ground: '#0c1018',
};

/**
 * Robot color encodes its live state, so yielding and queueing robots are
 * visually obvious — which is exactly what the simulation is meant to show.
 */
export function robotColor(r: RobotSnapshot): string {
  if (r.phase === 'charging') return '#22d3ee'; // cyan — recharging
  if (r.phase === 'to_charger') return '#06b6d4'; // dim cyan — heading to charge
  if (r.phase === 'riding') return '#a78bfa'; // violet — inside an elevator
  if (r.phase === 'awaiting_elevator') return '#fb923c'; // orange — queued at a lift
  if (r.yielding) return '#fbbf24'; // amber — yielding to let another robot pass
  if (r.phase === 'loading' || r.phase === 'unloading') return '#f472b6'; // pink — at a station
  if (r.carrying) return '#38bdf8'; // blue — carrying material to a dropoff
  if (r.phase === 'to_pickup') return '#4ade80'; // green — heading to a pickup
  return '#94a3b8'; // grey — idle
}

/** Human-readable labels for the on-screen legend. */
export const STATE_LEGEND: Array<{ label: string; color: string }> = [
  { label: 'To pickup', color: '#4ade80' },
  { label: 'Carrying', color: '#38bdf8' },
  { label: 'Yielding', color: '#fbbf24' },
  { label: 'Waiting for lift', color: '#fb923c' },
  { label: 'Riding', color: '#a78bfa' },
  { label: 'At station', color: '#f472b6' },
  { label: 'Charging', color: '#22d3ee' },
];
