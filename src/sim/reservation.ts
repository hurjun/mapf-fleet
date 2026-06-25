/**
 * Space-time reservation table for cooperative path-finding.
 *
 * Higher-priority robots reserve the cells (vertices) and transitions (edges)
 * they will occupy over a short planning window. Lower-priority robots then
 * plan around those reservations, which is what makes them yield and queue.
 *
 * Time is relative to "now": t = 0 is the current tick, t = 1 the next, etc.
 * Keys include the floor so robots on different floors never interfere.
 */
export class ReservationTable {
  private vertices = new Set<string>();
  private edges = new Set<string>();

  clear(): void {
    this.vertices.clear();
    this.edges.clear();
  }

  /** Reserve a cell at a single time step. */
  reserveVertex(floor: number, x: number, y: number, t: number): void {
    this.vertices.add(vKey(floor, x, y, t));
  }

  /** Reserve a stationary robot's cell across the whole window [t0, t1]. */
  reserveStatic(floor: number, x: number, y: number, t0: number, t1: number): void {
    for (let t = t0; t <= t1; t++) this.vertices.add(vKey(floor, x, y, t));
  }

  /**
   * Reserve the transition (ax,ay) -> (bx,by) departing at time t. Stored
   * unordered so it also blocks the reverse move (bx,by) -> (ax,ay), which is
   * how head-on swaps are prevented.
   */
  reserveEdge(floor: number, ax: number, ay: number, bx: number, by: number, t: number): void {
    this.edges.add(eKey(floor, ax, ay, bx, by, t));
  }

  isVertexReserved(floor: number, x: number, y: number, t: number): boolean {
    return this.vertices.has(vKey(floor, x, y, t));
  }

  /** Release a single vertex reservation (used for temporary constraints). */
  freeVertex(floor: number, x: number, y: number, t: number): void {
    this.vertices.delete(vKey(floor, x, y, t));
  }

  isEdgeReserved(floor: number, ax: number, ay: number, bx: number, by: number, t: number): boolean {
    return this.edges.has(eKey(floor, ax, ay, bx, by, t));
  }
}

function vKey(floor: number, x: number, y: number, t: number): string {
  return `${floor}|${x}|${y}|${t}`;
}

/** Canonical (order-independent) edge key so a<->b and b<->a collide. */
function eKey(floor: number, ax: number, ay: number, bx: number, by: number, t: number): string {
  const a = ay * 100000 + ax;
  const b = by * 100000 + bx;
  const lo = a < b ? `${ax},${ay}` : `${bx},${by}`;
  const hi = a < b ? `${bx},${by}` : `${ax},${ay}`;
  return `${floor}|${lo}|${hi}|${t}`;
}
