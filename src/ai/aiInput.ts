// ИИ — конечный автомат и принятие решений

import type { GameState, WizardState, InputFrame, MoveDirection, Vec2, SpellData, RecipeData } from '../core/types';
import type { WizardInput } from '../core/types';
import { AI_CONFIG, MAP, RECIPES, SPELLS, getSpell, getRecipe } from '../core/simulation';
import { CELL } from '../core/constants';
import { findPath } from '../navigation/astar';
import { smoothPath } from '../navigation/pathSmoother';
import { cellCenter, worldToCell, hasLineOfSight, isWalkable } from '../navigation/grid';
import type { Grid } from '../navigation/grid';
import { STEP } from '../core/constants';
import type { Rng } from '../core/rng';

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distCells(a: Vec2, b: Vec2): number {
  return dist(a, b) / CELL;
}

function dirToVec(dir: MoveDirection): Vec2 {
  switch (dir) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    default: return { x: 0, y: 0 };
  }
}

function facingToward(from: Vec2, to: Vec2): MoveDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

function emptyFrame(): InputFrame {
  return {
    move: 'none', cast: false, interact: false,
    nextSlot: false, prevSlot: false, selectSlot: null,
    cancel: false, pause: false, confirm: false, back: false,
  };
}

// Perception: can AI see the player?
function updatePerception(ai: WizardState, player: WizardState, grid: Grid): void {
  if (player.dead) {
    ai.isPlayerVisible = false;
    return;
  }

  const d = distCells(ai.position, player.position);
  const fovHalf = AI_CONFIG.fieldOfView / 2;

  // Check distance
  if (d > AI_CONFIG.detectionRadius) {
    ai.isPlayerVisible = false;
    return;
  }

  // Check FOV
  const facingVec = dirToVec(ai.facing);
  const toPlayer = { x: player.position.x - ai.position.x, y: player.position.y - ai.position.y };
  const len = Math.sqrt(toPlayer.x * toPlayer.x + toPlayer.y * toPlayer.y);
  if (len > 0.001) {
    const dot = (facingVec.x * toPlayer.x + facingVec.y * toPlayer.y) / len;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
    if (angle > fovHalf) {
      ai.isPlayerVisible = false;
      return;
    }
  }

  // Check line of sight
  if (!hasLineOfSight(ai.position.x, ai.position.y, player.position.x, player.position.y, grid.walls)) {
    ai.isPlayerVisible = false;
    return;
  }

  ai.isPlayerVisible = true;
  ai.lastKnownPlayerPosition = { ...player.position };
  ai.lastSeenTime = 0;
  ai.hasValidLastKnown = true;
}

function getAttackSpellSlots(wizard: WizardState): number[] {
  const result: number[] = [];
  for (let i = 0; i < wizard.slots.length; i++) {
    const slot = wizard.slots[i];
    if (!slot || slot.charges <= 0) continue;
    const spell = getSpell(slot.spellId);
    if (spell && spell.type === 'attack' && (wizard.cooldowns[spell.id] || 0) <= 0 && wizard.gcd <= 0) {
      result.push(i);
    }
  }
  return result;
}

function hasHealCharge(wizard: WizardState): boolean {
  for (const slot of wizard.slots) {
    if (slot && slot.spellId === 'heal' && slot.charges > 0 && (wizard.cooldowns['heal'] || 0) <= 0 && wizard.gcd <= 0) {
      return true;
    }
  }
  return false;
}

function canCraftHeal(wizard: WizardState): boolean {
  const healRecipe = RECIPES.find(r => r.resultSpell === 'heal');
  if (!healRecipe) return false;
  for (const ing of healRecipe.ingredients) {
    if ((wizard.herbs[ing.herb] || 0) < ing.amount) return false;
  }
  return true;
}

function findBestAttackRecipe(wizard: WizardState): RecipeData | null {
  for (const recipe of RECIPES) {
    const spell = getSpell(recipe.resultSpell);
    if (!spell || spell.type !== 'attack') continue;
    let canCraft = true;
    for (const ing of recipe.ingredients) {
      if ((wizard.herbs[ing.herb] || 0) < ing.amount) { canCraft = false; break; }
    }
    if (canCraft) return recipe;
  }
  return null;
}

function findNeededHerbs(wizard: WizardState): string[] {
  const needed: string[] = [];
  // Priority: attack recipes first
  for (const recipe of RECIPES) {
    const spell = getSpell(recipe.resultSpell);
    if (!spell || spell.type !== 'attack') continue;
    for (const ing of recipe.ingredients) {
      const have = wizard.herbs[ing.herb] || 0;
      if (have < ing.amount) {
        const missing = ing.amount - have;
        for (let i = 0; i < missing; i++) needed.push(ing.herb);
      }
    }
    if (needed.length > 0) break; // Found a recipe to work toward
  }
  return needed;
}

function findNearestHerb(ai: WizardState, herbTypes: string[], herbs: GameState['herbs']): Vec2 | null {
  let nearest: Vec2 | null = null;
  let minDist = Infinity;
  for (const h of herbs) {
    if (herbTypes.length > 0 && !herbTypes.includes(h.herbId)) continue;
    const d = dist(ai.position, h.position);
    if (d < minDist) {
      minDist = d;
      nearest = h.position;
    }
  }
  return nearest;
}

function getMovementToward(from: Vec2, to: Vec2): MoveDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else if (Math.abs(dy) > 1) {
    return dy > 0 ? 'down' : 'up';
  }
  return 'none';
}

export class AIInput implements WizardInput {
  private grid: Grid;
  private path: Vec2[] = [];
  private pathIndex = 0;
  private pathReplanTimer = 0;
  private decisionTimer = 0;
  private stuckTimer = 0;
  private stuckCount = 0;
  private lastPos: Vec2 = { x: 0, y: 0 };
  private wanderTimer = 0;
  private idleTimer = 0.5;
  private currentState = 'Idle';
  private rng: Rng;
  private targetPos: Vec2 | null = null;
  private aiFleeTimer = 0;

  constructor(grid: Grid, rng: Rng, startPos: Vec2) {
    this.grid = grid;
    this.rng = rng;
    this.lastPos = { ...startPos };
  }

  private setTarget(pos: Vec2): void {
    this.targetPos = pos;
    this.path = findPath(this.grid, this.lastPos, pos) || [];
    this.path = smoothPath(this.path);
    this.pathIndex = 0;
    this.pathReplanTimer = AI_CONFIG.pathReplanInterval;
  }

  private getNextMove(pos: Vec2): MoveDirection {
    if (!this.path || this.pathIndex >= this.path.length) return 'none';
    const target = this.path[this.pathIndex];
    const d = dist(pos, target);
    if (d < 4) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return 'none';
    }
    return getMovementToward(pos, this.path[this.pathIndex]);
  }

  read(tick: number): InputFrame {
    // This will be called with the full state context set externally
    return emptyFrame();
  }

  readWithState(tick: number, state: GameState): InputFrame {
    const ai = state.wizards[1];
    const player = state.wizards[0];
    const frame = emptyFrame();

    if (ai.dead) return frame;

    // Update perception
    updatePerception(ai, player, this.grid);

    // Forget player
    if (!ai.isPlayerVisible && ai.hasValidLastKnown) {
      ai.lastSeenTime += STEP;
      if (ai.lastSeenTime > AI_CONFIG.forgetPlayerTime) {
        ai.hasValidLastKnown = false;
      }
    }

    // Decision making
    this.decisionTimer -= STEP;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = AI_CONFIG.decisionInterval;
      this.currentState = this.decide(state);
    }

    // Execute current state
    const hpRatio = ai.hp / ai.maxHp;

    switch (this.currentState) {
      case 'Idle':
        this.idleTimer -= STEP;
        if (this.idleTimer <= 0) {
          this.currentState = 'Wander';
          this.idleTimer = 0.5;
        }
        break;

      case 'GatherHerbs': {
        const needed = findNeededHerbs(ai);
        const allHerbTypes = needed.length > 0 ? needed : ['fire', 'moon', 'stone'];
        const target = findNearestHerb(ai, allHerbTypes, state.herbs);
        if (target) {
          this.pathReplanTimer -= STEP;
          if (this.pathReplanTimer <= 0 || this.path.length === 0) {
            this.setTarget(target);
          }
          frame.move = this.getNextMove(ai.position);
          ai.facing = frame.move !== 'none' ? frame.move : ai.facing;
        } else {
          this.currentState = 'Wander';
        }
        break;
      }

      case 'ReturnToBase': {
        const cauldronPos = cellCenter(MAP.aiCauldron[0], MAP.aiCauldron[1]);
        const d = dist(ai.position, cauldronPos);
        if (d > 48) {
          this.pathReplanTimer -= STEP;
          if (this.pathReplanTimer <= 0 || this.path.length === 0) {
            this.setTarget(cauldronPos);
          }
          frame.move = this.getNextMove(ai.position);
          ai.facing = frame.move !== 'none' ? frame.move : ai.facing;
        } else {
          // At cauldron, start crafting
          frame.interact = true;
          this.currentState = 'Craft';
        }
        break;
      }

      case 'Craft':
        // Just wait for craft to finish; handled by simulation
        if (!ai.craft) {
          this.currentState = this.decide(state);
        }
        break;

      case 'SeekEnemy': {
        if (ai.hasValidLastKnown && ai.lastKnownPlayerPosition) {
          const d = dist(ai.position, ai.lastKnownPlayerPosition);
          if (d < CELL) {
            this.currentState = 'Wander';
          } else {
            this.pathReplanTimer -= STEP;
            if (this.pathReplanTimer <= 0 || this.path.length === 0) {
              this.setTarget(ai.lastKnownPlayerPosition);
            }
            frame.move = this.getNextMove(ai.position);
            ai.facing = frame.move !== 'none' ? frame.move : ai.facing;
          }
        } else {
          this.currentState = 'Wander';
        }
        break;
      }

      case 'Attack': {
        const attackSlots = getAttackSpellSlots(ai);
        if (attackSlots.length > 0) {
          // Select best slot
          ai.activeSlot = attackSlots[0];

          const d = distCells(ai.position, player.position);
          if (d > AI_CONFIG.attackRange) {
            // Move closer
            this.pathReplanTimer -= STEP;
            if (this.pathReplanTimer <= 0 || this.path.length === 0) {
              this.setTarget(player.position);
            }
            frame.move = this.getNextMove(ai.position);
          } else if (d < AI_CONFIG.minRange) {
            // Move away
            const away = {
              x: ai.position.x + (ai.position.x - player.position.x),
              y: ai.position.y + (ai.position.y - player.position.y),
            };
            frame.move = getMovementToward(ai.position, away);
          }
          // Face player
          ai.facing = facingToward(ai.position, player.position);
          // Cast if ready
          const spell = getSpell(ai.slots[ai.activeSlot]!.spellId);
          if (spell && (ai.cooldowns[spell.id] || 0) <= 0 && ai.gcd <= 0) {
            frame.cast = true;
          }
        } else {
          this.currentState = this.decide(state);
        }
        break;
      }

      case 'Heal': {
        // Find heal slot and cast
        for (let i = 0; i < ai.slots.length; i++) {
          const slot = ai.slots[i];
          if (slot && slot.spellId === 'heal' && slot.charges > 0 && (ai.cooldowns['heal'] || 0) <= 0 && ai.gcd <= 0) {
            ai.activeSlot = i;
            frame.cast = true;
            break;
          }
        }
        if (!frame.cast) {
          this.currentState = this.decide(state);
        }
        break;
      }

      case 'Flee': {
        const cauldronPos = cellCenter(MAP.aiCauldron[0], MAP.aiCauldron[1]);
        const dToPlayer = distCells(ai.position, player.position);
        let target: Vec2;
        if (dToPlayer > 4) {
          target = cauldronPos;
        } else {
          // Find farthest reachable cell
          target = cauldronPos; // Simplified: just flee to cauldron
        }
        this.pathReplanTimer -= STEP;
        if (this.pathReplanTimer <= 0 || this.path.length === 0) {
          this.setTarget(target);
        }
        frame.move = this.getNextMove(ai.position);
        ai.facing = frame.move !== 'none' ? frame.move : ai.facing;

        // Exit flee if player not visible for 1s
        if (!ai.isPlayerVisible) {
          this.aiFleeTimer = (this.aiFleeTimer || 0) + STEP;
          if (this.aiFleeTimer > 1) {
            this.currentState = this.decide(state);
            this.aiFleeTimer = 0;
          }
        } else {
          this.aiFleeTimer = 0;
        }
        break;
      }

      case 'Wander': {
        this.wanderTimer -= STEP;
        if (this.wanderTimer <= 0 || this.path.length === 0 || this.pathIndex >= this.path.length) {
          this.wanderTimer = 3;
          // Pick random walkable point biased toward center
          let attempts = 0;
          let target: Vec2 | null = null;
          while (attempts < 20) {
            const col = this.rng.nextInt(2, this.grid.cols - 2);
            const row = this.rng.nextInt(2, this.grid.rows - 2);
            if (isWalkable(this.grid, col, row)) {
              target = cellCenter(col, row);
              break;
            }
            attempts++;
          }
          if (target) {
            this.setTarget(target);
          }
        }
        frame.move = this.getNextMove(ai.position);
        ai.facing = frame.move !== 'none' ? frame.move : ai.facing;
        break;
      }
    }

    // Stuck detection
    const moved = dist(ai.position, this.lastPos);
    if (moved < 1 && frame.move !== 'none') {
      this.stuckTimer += STEP;
      if (this.stuckTimer > AI_CONFIG.stuckTimeout) {
        this.stuckCount++;
        this.stuckTimer = 0;
        if (this.stuckCount >= 3) {
          this.currentState = 'Wander';
          this.stuckCount = 0;
          this.path = [];
        } else {
          // Replan
          if (this.targetPos) this.setTarget(this.targetPos);
        }
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPos = { ...ai.position };

    return frame;
  }

  private decide(state: GameState): string {
    const ai = state.wizards[1];
    const player = state.wizards[0];
    const hpRatio = ai.hp / ai.maxHp;

    // 1. Dead
    if (ai.dead) return 'Idle';

    // 2. Crafting - continue unless critical
    if (ai.craft) {
      if (ai.isPlayerVisible && (getAttackSpellSlots(ai).length > 0 || hpRatio < 0.3)) {
        return ai.isPlayerVisible && getAttackSpellSlots(ai).length > 0 ? 'Attack' : 'Flee';
      }
      return 'Craft';
    }

    // 3. Low HP
    if (hpRatio < AI_CONFIG.fleeHealthThreshold) {
      if (hasHealCharge(ai)) return 'Heal';
      if (canCraftHeal(ai)) return 'ReturnToBase';
      if (ai.isPlayerVisible) return 'Flee';
      return 'GatherHerbs';
    }

    // 4. Player visible
    if (ai.isPlayerVisible) {
      if (getAttackSpellSlots(ai).length > 0) return 'Attack';
      if (findBestAttackRecipe(ai)) return 'ReturnToBase';
      return 'GatherHerbs';
    }

    // 5. Player not visible
    if (getAttackSpellSlots(ai).length > 0 && ai.hasValidLastKnown) return 'SeekEnemy';
    if (findBestAttackRecipe(ai)) return 'ReturnToBase';
    return 'GatherHerbs';
  }
}
