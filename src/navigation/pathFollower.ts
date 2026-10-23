// Следование по пути

import type { Vec2, MoveDirection } from '../core/types';
import { CELL, MOVE_SPEED, WAYPOINT_THRESHOLD, STEP } from '../core/constants';

export interface PathFollowerState {
  path: Vec2[];
  index: number;
  reached: boolean;
}

export function createPathFollower(): PathFollowerState {
  return { path: [], index: 0, reached: true };
}

export function setPath(state: PathFollowerState, path: Vec2[]): void {
  state.path = path;
  state.index = 0;
  state.reached = path.length === 0;
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Get movement direction toward next waypoint
export function getMovementDirection(
  state: PathFollowerState,
  currentPos: Vec2
): MoveDirection {
  if (state.reached || state.path.length === 0) return 'none';
  if (state.index >= state.path.length) {
    state.reached = true;
    return 'none';
  }

  const target = state.path[state.index];
  const d = dist(currentPos, target);

  if (d < WAYPOINT_THRESHOLD) {
    state.index++;
    if (state.index >= state.path.length) {
      state.reached = true;
      return 'none';
    }
  }

  const t = state.path[state.index];
  const dx = t.x - currentPos.x;
  const dy = t.y - currentPos.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else if (Math.abs(dy) > 0.5) {
    return dy > 0 ? 'down' : 'up';
  }
  return 'none';
}

export function isReached(state: PathFollowerState): boolean {
  return state.reached;
}
