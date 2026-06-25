/**
 * Elevator car runtime + scheduler.
 *
 * Each car serves a contiguous range of floors with a fixed capacity. It runs a
 * LOOK-style scan: it keeps moving in its current direction while there is a
 * stop to serve ahead (a rider's destination or a floor with a robot waiting),
 * otherwise it reverses, otherwise it idles.
 *
 * Robots board only from the boarding pad cell, one at a time, so a visible
 * queue forms on the floor grid when several robots want the same car. The car
 * fills from that queue up to capacity, then departs.
 */

import { Elevator, ElevatorSnapshot } from './types';

interface Rider {
  robotId: number;
  targetFloor: number;
}

/** Bridges the car to the rest of the engine for the current tick. */
export interface ElevatorContext {
  /** Floors that have a robot standing on this car's boarding pad. */
  callFloors: Set<number>;
  /** The robot waiting on the boarding pad at `floor`, if any. */
  boarder(floor: number): Rider | undefined;
  /** Take a robot off the floor and into the car. */
  onBoard(robotId: number, targetFloor: number): void;
  /** Drop a rider onto the exit pad at `floor`; false if the pad is blocked. */
  onUnload(robotId: number, floor: number): boolean;
}

type CarState = 'idle' | 'moving' | 'doors';

export class ElevatorController {
  readonly cfg: Elevator;
  private readonly minFloor: number;
  private readonly maxFloor: number;

  currentFloor: number;
  floorPos: number;
  direction: -1 | 0 | 1 = 0;
  state: CarState = 'idle';
  private doorTimer = 0;
  private travelTimer = 0;
  private riders: Rider[] = [];

  constructor(cfg: Elevator, startFloor = cfg.floors[0]) {
    this.cfg = cfg;
    this.minFloor = cfg.floors[0];
    this.maxFloor = cfg.floors[cfg.floors.length - 1];
    this.currentFloor = startFloor;
    this.floorPos = startFloor;
  }

  get riderCount(): number {
    return this.riders.length;
  }

  get doorsOpen(): boolean {
    return this.state === 'doors';
  }

  /** Floors that still need a stop: rider destinations plus waiting floors. */
  private targets(ctx: ElevatorContext): Set<number> {
    const set = new Set<number>(ctx.callFloors);
    for (const r of this.riders) set.add(r.targetFloor);
    return set;
  }

  private hasTargetInDirection(dir: number, targets: Set<number>): boolean {
    for (const f of targets) {
      if (dir > 0 && f > this.currentFloor) return true;
      if (dir < 0 && f < this.currentFloor) return true;
    }
    return false;
  }

  private directionToNearest(targets: Set<number>): -1 | 1 {
    let best = Infinity;
    let dir: -1 | 1 = 1;
    for (const f of targets) {
      const d = Math.abs(f - this.currentFloor);
      if (d < best && f !== this.currentFloor) {
        best = d;
        dir = f > this.currentFloor ? 1 : -1;
      }
    }
    return dir;
  }

  /** Advance the car by one tick. */
  step(ctx: ElevatorContext): void {
    switch (this.state) {
      case 'doors':
        this.stepDoors(ctx);
        break;
      case 'moving':
        this.stepMoving(ctx);
        break;
      case 'idle':
        this.decideMotion(ctx);
        break;
    }
  }

  private stepDoors(ctx: ElevatorContext): void {
    let activity = false;

    // Unload everyone who wanted this floor (keep doors open while unloading).
    for (let i = this.riders.length - 1; i >= 0; i--) {
      if (this.riders[i].targetFloor !== this.currentFloor) continue;
      if (ctx.onUnload(this.riders[i].robotId, this.currentFloor)) {
        this.riders.splice(i, 1);
        activity = true;
      }
    }

    // Load the robot on the boarding pad, if any and there is room.
    const boarder = ctx.boarder(this.currentFloor);
    if (boarder && this.riders.length < this.cfg.capacity) {
      ctx.onBoard(boarder.robotId, boarder.targetFloor);
      this.riders.push({ robotId: boarder.robotId, targetFloor: boarder.targetFloor });
      activity = true;
    }

    if (activity) this.doorTimer = this.cfg.doorTicks;
    else this.doorTimer--;

    if (this.doorTimer <= 0) this.decideMotion(ctx);
  }

  private stepMoving(ctx: ElevatorContext): void {
    this.travelTimer--;
    const frac = 1 - this.travelTimer / this.cfg.travelTicksPerFloor;
    this.floorPos = this.currentFloor + this.direction * frac;

    if (this.travelTimer > 0) return;

    this.currentFloor += this.direction;
    this.floorPos = this.currentFloor;

    const targets = this.targets(ctx);
    if (targets.has(this.currentFloor)) {
      this.openDoors();
    } else if (this.hasTargetInDirection(this.direction, targets)) {
      this.startTravel();
    } else {
      this.decideMotion(ctx);
    }
  }

  private decideMotion(ctx: ElevatorContext): void {
    const targets = this.targets(ctx);
    if (targets.size === 0) {
      this.state = 'idle';
      this.direction = 0;
      this.floorPos = this.currentFloor;
      return;
    }
    if (targets.has(this.currentFloor)) {
      this.openDoors();
      return;
    }
    let dir = this.direction;
    if (dir === 0 || !this.hasTargetInDirection(dir, targets)) {
      dir = this.directionToNearest(targets);
    }
    this.direction = dir;
    this.startTravel();
  }

  private startTravel(): void {
    // Guard against running past the served range.
    const next = this.currentFloor + this.direction;
    if (next < this.minFloor || next > this.maxFloor) {
      this.state = 'idle';
      this.direction = 0;
      return;
    }
    this.state = 'moving';
    this.travelTimer = this.cfg.travelTicksPerFloor;
  }

  private openDoors(): void {
    this.state = 'doors';
    this.doorTimer = this.cfg.doorTicks;
    this.floorPos = this.currentFloor;
  }

  snapshot(queued: number): ElevatorSnapshot {
    return {
      id: this.cfg.id,
      x: this.cfg.x,
      y: this.cfg.y,
      floorPos: this.floorPos,
      riders: this.riders.length,
      capacity: this.cfg.capacity,
      doorsOpen: this.doorsOpen,
      queued,
    };
  }
}
