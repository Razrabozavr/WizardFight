// Навигационная сетка и коллизии

import { CELL, MAP_COLS, MAP_ROWS, WIZARD_HALF } from '../core/constants';
import type { MapData, Vec2 } from '../core/types';

export interface Grid {
  cols: number;
  rows: number;
  walkable: boolean[][];
  walls: { x: number; y: number; w: number; h: number }[];
}

export function buildGrid(mapData: MapData): Grid {
  const cols = mapData.width;
  const rows = mapData.height;
  const walkable: boolean[][] = [];
  const walls: { x: number; y: number; w: number; h: number }[] = [];

  // Parse wall cells
  const isWall: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    isWall[r] = [];
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      isWall[r][c] = mapData.cells[idx] === '#';
    }
  }

  // Build walkable grid accounting for wizard size
  for (let r = 0; r < rows; r++) {
    walkable[r] = [];
    for (let c = 0; c < cols; c++) {
      if (isWall[r][c]) {
        walkable[r][c] = false;
      } else {
        // Check if wizard AABB at cell center intersects any wall
        const cx = (c + 0.5) * CELL;
        const cy = (r + 0.5) * CELL;
        const left = cx - WIZARD_HALF;
        const right = cx + WIZARD_HALF;
        const top = cy - WIZARD_HALF;
        const bottom = cy + WIZARD_HALF;
        let blocked = false;
        // Check neighboring wall cells
        for (let dr = -1; dr <= 1 && !blocked; dr++) {
          for (let dc = -1; dc <= 1 && !blocked; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && isWall[nr][nc]) {
              const wl = nc * CELL;
              const wr = (nc + 1) * CELL;
              const wt = nr * CELL;
              const wb = (nr + 1) * CELL;
              if (left < wr && right > wl && top < wb && bottom > wt) {
                blocked = true;
              }
            }
          }
        }
        walkable[r][c] = !blocked;
      }
    }
  }

  // Build wall rectangles for collision
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isWall[r][c]) {
        walls.push({ x: c * CELL, y: r * CELL, w: CELL, h: CELL });
      }
    }
  }

  return { cols, rows, walkable, walls };
}

export function cellCenter(col: number, row: number): Vec2 {
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

export function worldToCell(x: number, y: number): { col: number; row: number } {
  return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
}

export function isWalkable(grid: Grid, col: number, row: number): boolean {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return false;
  return grid.walkable[row][col];
}

// AABB vs AABB collision
export function aabbOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Resolve wizard position against walls
export function resolveCollision(pos: Vec2, walls: { x: number; y: number; w: number; h: number }[]): Vec2 {
  let x = pos.x;
  let y = pos.y;
  const half = WIZARD_HALF;

  for (const wall of walls) {
    const left = x - half;
    const right = x + half;
    const top = y - half;
    const bottom = y + half;

    if (aabbOverlap(left, top, WIZARD_HALF * 2, WIZARD_HALF * 2, wall.x, wall.y, wall.w, wall.h)) {
      // Calculate overlap on each axis
      const overlapLeft = right - wall.x;
      const overlapRight = (wall.x + wall.w) - left;
      const overlapTop = bottom - wall.y;
      const overlapBottom = (wall.y + wall.h) - top;

      const minOverlapX = Math.min(overlapLeft, overlapRight);
      const minOverlapY = Math.min(overlapTop, overlapBottom);

      if (minOverlapX < minOverlapY) {
        if (overlapLeft < overlapRight) {
          x -= overlapLeft;
        } else {
          x += overlapRight;
        }
      } else {
        if (overlapTop < overlapBottom) {
          y -= overlapTop;
        } else {
          y += overlapBottom;
        }
      }
    }
  }

  return { x, y };
}

// Segment vs AABB intersection for projectile collision
export function segmentVsAABB(
  sx: number, sy: number, ex: number, ey: number,
  rx: number, ry: number, rw: number, rh: number
): boolean {
  // Check if line segment intersects rectangle
  const dx = ex - sx;
  const dy = ey - sy;
  let tmin = 0, tmax = 1;

  if (Math.abs(dx) < 0.0001) {
    if (sx < rx || sx > rx + rw) return false;
  } else {
    const t1 = (rx - sx) / dx;
    const t2 = (rx + rw - sx) / dx;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return false;
  }

  if (Math.abs(dy) < 0.0001) {
    if (sy < ry || sy > ry + rh) return false;
  } else {
    const t1 = (ry - sy) / dy;
    const t2 = (ry + rh - sy) / dy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmin > tmax) return false;
  }

  return true;
}

// Segment vs circle intersection
export function segmentVsCircle(
  sx: number, sy: number, ex: number, ey: number,
  cx: number, cy: number, r: number
): boolean {
  const dx = ex - sx;
  const dy = ey - sy;
  const fx = sx - cx;
  const fy = sy - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

// Check line of sight between two points (no walls in between)
export function hasLineOfSight(
  x1: number, y1: number, x2: number, y2: number,
  walls: { x: number; y: number; w: number; h: number }[]
): boolean {
  for (const wall of walls) {
    if (segmentVsAABB(x1, y1, x2, y2, wall.x, wall.y, wall.w, wall.h)) {
      return false;
    }
  }
  return true;
}
