// Шина событий

import type { GameEvent } from './types';

export type EventHandler = (event: GameEvent) => void;

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(type: string, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: EventHandler): void {
    const list = this.handlers.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  emit(event: GameEvent): void {
    const list = this.handlers.get(event.type);
    if (list) {
      for (const h of list) {
        h(event);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

// Типы событий
export const EVT = {
  HEALTH_CHANGED: 'HealthChanged',
  DAMAGE_DEALT: 'DamageDealt',
  DEATH: 'Death',
  HERB_GATHERED: 'HerbGathered',
  SPELLS_CHANGED: 'SpellsChanged',
  SLOT_CHANGED: 'SlotChanged',
  CRAFT_STARTED: 'CraftStarted',
  CRAFT_PROGRESS: 'CraftProgress',
  CRAFT_COMPLETED: 'CraftCompleted',
  CRAFT_CANCELLED: 'CraftCancelled',
  CAST: 'Cast',
  PROJECTILE_HIT: 'ProjectileHit',
  MATCH_ENDED: 'MatchEnded',
  PHASE_CHANGED: 'PhaseChanged',
  SHIELD_APPLIED: 'ShieldApplied',
} as const;
