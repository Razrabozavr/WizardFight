// Сглаживание пути — сжатие коллинеарных точек без диагоналей

import type { Vec2 } from '../core/types';
import { CELL } from '../core/constants';

export function smoothPath(path: Vec2[]): Vec2[] {
  if (path.length <= 2) return path;

  const result: Vec2[] = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Check if prev->curr and curr->next are collinear (same direction)
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    // Normalize directions
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 < 0.001 || len2 < 0.001) continue;

    const nx1 = dx1 / len1;
    const ny1 = dy1 / len1;
    const nx2 = dx2 / len2;
    const ny2 = dy2 / len2;

    // If directions differ, keep this point
    if (Math.abs(nx1 - nx2) > 0.01 || Math.abs(ny1 - ny2) > 0.01) {
      result.push(curr);
    }
  }

  result.push(path[path.length - 1]);
  return result;
}
