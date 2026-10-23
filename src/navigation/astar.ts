// A* поиск пути

import { ASTAR_MAX_NODES, ASTAR_MAX_PATH, CELL } from '../core/constants';
import type { Vec2 } from '../core/types';
import type { Grid } from './grid';
import { cellCenter, isWalkable, worldToCell } from './grid';

interface AStarNode {
  col: number;
  row: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

function heuristic(c1: number, r1: number, c2: number, r2: number): number {
  return Math.abs(c1 - c2) + Math.abs(r1 - r2);
}

const DIRS = [
  { dc: 0, dr: -1 }, // up
  { dc: 0, dr: 1 },  // down
  { dc: -1, dr: 0 }, // left
  { dc: 1, dr: 0 },  // right
];

export function astar(grid: Grid, startCol: number, startRow: number, endCol: number, endRow: number): Vec2[] | null {
  if (!isWalkable(grid, startCol, startRow) || !isWalkable(grid, endCol, endRow)) {
    return null;
  }
  if (startCol === endCol && startRow === endRow) {
    return [cellCenter(startCol, startRow)];
  }

  const open: AStarNode[] = [];
  const closed = new Set<string>();
  const startNode: AStarNode = {
    col: startCol, row: startRow,
    g: 0, h: heuristic(startCol, startRow, endCol, endRow),
    f: 0, parent: null
  };
  startNode.f = startNode.g + startNode.h;
  open.push(startNode);

  let nodesExplored = 0;

  while (open.length > 0 && nodesExplored < ASTAR_MAX_NODES) {
    // Find node with lowest f
    let minIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[minIdx].f) minIdx = i;
    }
    const current = open[minIdx];
    open.splice(minIdx, 1);
    nodesExplored++;

    const key = `${current.col},${current.row}`;
    if (closed.has(key)) continue;
    closed.add(key);

    if (current.col === endCol && current.row === endRow) {
      // Reconstruct path
      const path: Vec2[] = [];
      let node: AStarNode | null = current;
      while (node) {
        path.unshift(cellCenter(node.col, node.row));
        node = node.parent;
      }
      if (path.length > ASTAR_MAX_PATH) {
        return path.slice(0, ASTAR_MAX_PATH);
      }
      return path;
    }

    for (const dir of DIRS) {
      const nc = current.col + dir.dc;
      const nr = current.row + dir.dr;
      if (!isWalkable(grid, nc, nr)) continue;
      const nkey = `${nc},${nr}`;
      if (closed.has(nkey)) continue;

      const g = current.g + 1;
      const h = heuristic(nc, nr, endCol, endRow);
      const neighbor: AStarNode = {
        col: nc, row: nr, g, h, f: g + h, parent: current
      };
      open.push(neighbor);
    }
  }

  return null; // No path found
}

// Find path between two world positions
export function findPath(grid: Grid, from: Vec2, to: Vec2): Vec2[] | null {
  const start = worldToCell(from.x, from.y);
  const end = worldToCell(to.x, to.y);
  return astar(grid, start.col, start.row, end.col, end.row);
}
