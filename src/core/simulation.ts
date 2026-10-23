// Основная симуляция игры

import type {
  GameState, WizardState, HerbEntity, ProjectileEntity, InputFrame,
  Vec2, MoveDirection, SpellSlot, CraftState, MatchResult, MatchStats,
  SpellData, RecipeData, HerbData, AIConfig, MapData
} from './types';
import {
  CELL, MAP_COLS, MAP_ROWS, MOVE_SPEED, WIZARD_HALF, PICKUP_DIST,
  CAULDRON_INTERACT_DIST, PROJECTILE_HIT_RADIUS, STEP, GCD, MAX_HP,
  HERB_RESPAWN_INTERVAL, MIN_HERBS_PER_TYPE, TOTAL_HERBS, MAX_CHARGES, MAX_SLOTS
} from './constants';
import { Rng } from './rng';
import { EventBus, EVT } from './events';
import { buildGrid, cellCenter, worldToCell, resolveCollision, segmentVsAABB, segmentVsCircle, hasLineOfSight } from '../navigation/grid';
import type { Grid } from '../navigation/grid';
import { findPath } from '../navigation/astar';
import { smoothPath } from '../navigation/pathSmoother';

import herbsData from '../data/herbs.json';
import spellsData from '../data/spells.json';
import recipesData from '../data/recipes.json';
import aiData from '../data/ai.json';
import mapData from '../data/map.json';

export const HERBS: HerbData[] = herbsData.herbs as HerbData[];
export const SPELLS: SpellData[] = spellsData.spells as SpellData[];
export const RECIPES: RecipeData[] = recipesData.recipes as RecipeData[];
export const AI_CONFIG: AIConfig = aiData.ai;
export const MAP: MapData = mapData as MapData;

export function getSpell(id: string): SpellData | undefined {
  return SPELLS.find(s => s.id === id);
}

export function getRecipe(id: string): RecipeData | undefined {
  return RECIPES.find(r => r.id === id);
}

export function getHerb(id: string): HerbData | undefined {
  return HERBS.find(h => h.id === id);
}

export function createGrid(): Grid {
  return buildGrid(MAP);
}

function createWizardState(id: number, baseCol: number, baseRow: number): WizardState {
  const pos = cellCenter(baseCol, baseRow);
  return {
    id,
    position: { ...pos },
    facing: id === 0 ? 'right' : 'left',
    hp: MAX_HP,
    maxHp: MAX_HP,
    activeSlot: 0,
    slots: [null, null, null],
    herbs: { fire: 0, moon: 0, stone: 0 },
    cooldowns: {},
    gcd: 0,
    craft: null,
    shieldTime: 0,
    dead: false,
    lastKnownPlayerPosition: null,
    aiState: 'Idle',
    path: [],
    pathIndex: 0,
    aiDecisionTimer: 0,
    aiStuckTimer: 0,
    aiStuckCount: 0,
    aiLastPos: { ...pos },
    aiWanderTimer: 0,
    aiIdleTimer: 0.5,
    aiFleeTimer: 0,
    aiPathReplanTimer: 0,
    aiForgetTimer: 0,
    isPlayerVisible: false,
    lastSeenTime: 0,
    hasValidLastKnown: false,
  };
}

export function createInitialState(seed: number, mode: 'deathmatch' | 'timed', duration: number): GameState {
  const rng = new Rng(seed);
  const wizards: [WizardState, WizardState] = [
    createWizardState(0, MAP.playerBase[0], MAP.playerBase[1]),
    createWizardState(1, MAP.aiBase[0], MAP.aiBase[1]),
  ];

  // Place initial herbs
  const herbs: HerbEntity[] = [];
  let nextHerbId = 0;
  const spawnPoints = [...MAP.herbSpawnPoints];
  const shuffled = rng.shuffle(spawnPoints);

  // Place 3 of each type
  const herbTypes = ['fire', 'moon', 'stone'];
  let spIdx = 0;
  for (const hType of herbTypes) {
    for (let i = 0; i < MIN_HERBS_PER_TYPE; i++) {
      if (spIdx < shuffled.length) {
        const sp = shuffled[spIdx++];
        const pos = cellCenter(sp[0], sp[1]);
        herbs.push({ id: nextHerbId++, herbId: hType, position: pos, spawnPoint: spIdx - 1 });
      }
    }
  }

  return {
    seed,
    rngState: rng.getState(),
    tick: 0,
    phase: 'playing',
    mode,
    timeLeft: mode === 'deathmatch' ? Infinity : duration,
    wizards,
    herbs,
    projectiles: [],
    stats: [
      { damageDealt: 0, herbsGathered: 0, spellsCast: 0 },
      { damageDealt: 0, herbsGathered: 0, spellsCast: 0 },
    ],
    result: null,
    herbRespawnTimer: HERB_RESPAWN_INTERVAL,
    nextHerbId,
    nextProjectileId: 0,
    craftChoiceWizard: null,
    craftChoiceRecipeId: null,
    craftChoiceOptions: [],
    craftChoiceSelected: 0,
    craftChoiceType: 'recipe',
  };
}

function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
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

function moveWizard(wizard: WizardState, dir: MoveDirection, grid: Grid, dt: number): void {
  if (wizard.dead || dir === 'none') return;
  if (wizard.craft) return;

  const dv = dirToVec(dir);
  const speed = MOVE_SPEED * dt;
  wizard.position.x += dv.x * speed;
  wizard.position.y += dv.y * speed;
  wizard.facing = dir;

  // Resolve collisions
  wizard.position = resolveCollision(wizard.position, grid.walls);

  // Clamp to map bounds
  wizard.position.x = Math.max(WIZARD_HALF, Math.min(MAP_COLS * CELL - WIZARD_HALF, wizard.position.x));
  wizard.position.y = Math.max(WIZARD_HALF, Math.min(MAP_ROWS * CELL - WIZARD_HALF, wizard.position.y));
}

function pickupHerbs(wizard: WizardState, state: GameState, bus: EventBus): void {
  if (wizard.dead) return;
  const toRemove: number[] = [];
  for (let i = 0; i < state.herbs.length; i++) {
    const herb = state.herbs[i];
    if (dist(wizard.position, herb.position) <= PICKUP_DIST) {
      wizard.herbs[herb.herbId] = (wizard.herbs[herb.herbId] || 0) + 1;
      toRemove.push(i);
      state.stats[wizard.id].herbsGathered++;
      bus.emit({ type: EVT.HERB_GATHERED, data: { wizardId: wizard.id, herbId: herb.herbId } });
    }
  }
  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.herbs.splice(toRemove[i], 1);
  }
}

function respawnHerbs(state: GameState, rng: Rng): void {
  // Ensure minimum of each type
  const counts: Record<string, number> = { fire: 0, moon: 0, stone: 0 };
  for (const h of state.herbs) {
    counts[h.herbId] = (counts[h.herbId] || 0) + 1;
  }

  const usedPoints = new Set(state.herbs.map(h => h.spawnPoint));
  const availablePoints = MAP.herbSpawnPoints
    .map((p, i) => i)
    .filter(i => !usedPoints.has(i));

  // First ensure minimum per type
  for (const hType of ['fire', 'moon', 'stone']) {
    while (counts[hType] < MIN_HERBS_PER_TYPE && availablePoints.length > 0) {
      const ptIdx = rng.nextInt(0, availablePoints.length);
      const spIdx = availablePoints.splice(ptIdx, 1)[0];
      const sp = MAP.herbSpawnPoints[spIdx];
      state.herbs.push({
        id: state.nextHerbId++,
        herbId: hType,
        position: cellCenter(sp[0], sp[1]),
        spawnPoint: spIdx,
      });
      counts[hType]++;
    }
  }

  // Fill up to TOTAL_HERBS by weight
  const totalWeight = HERBS.reduce((s, h) => s + h.spawnWeight, 0);
  while (state.herbs.length < TOTAL_HERBS && availablePoints.length > 0) {
    let roll = rng.next() * totalWeight;
    let chosen = HERBS[0];
    for (const h of HERBS) {
      roll -= h.spawnWeight;
      if (roll <= 0) { chosen = h; break; }
    }
    const ptIdx = rng.nextInt(0, availablePoints.length);
    const spIdx = availablePoints.splice(ptIdx, 1)[0];
    const sp = MAP.herbSpawnPoints[spIdx];
    state.herbs.push({
      id: state.nextHerbId++,
      herbId: chosen.id,
      position: cellCenter(sp[0], sp[1]),
      spawnPoint: spIdx,
    });
  }
}

function getCauldronPos(wizardId: number): Vec2 {
  if (wizardId === 0) return cellCenter(MAP.playerCauldron[0], MAP.playerCauldron[1]);
  return cellCenter(MAP.aiCauldron[0], MAP.aiCauldron[1]);
}

function isNearCauldron(wizard: WizardState): boolean {
  const cauldronPos = getCauldronPos(wizard.id);
  return dist(wizard.position, cauldronPos) <= CAULDRON_INTERACT_DIST;
}

function canCraftRecipe(wizard: WizardState, recipe: RecipeData): boolean {
  for (const ing of recipe.ingredients) {
    if ((wizard.herbs[ing.herb] || 0) < ing.amount) return false;
  }
  return true;
}

function getAvailableRecipes(wizard: WizardState): RecipeData[] {
  return RECIPES.filter(r => canCraftRecipe(wizard, r));
}

function startCraft(wizard: WizardState, recipe: RecipeData, state: GameState, bus: EventBus): void {
  if (wizard.craft) return;
  if (!isNearCauldron(wizard)) return;
  if (!canCraftRecipe(wizard, recipe)) return;

  // Reserve ingredients
  const reserved: Record<string, number> = {};
  for (const ing of recipe.ingredients) {
    reserved[ing.herb] = ing.amount;
  }

  const duration = Math.max(1.0, recipe.craftTime);
  wizard.craft = {
    recipeId: recipe.id,
    progress: 0,
    duration,
    reservedIngredients: reserved,
  };

  bus.emit({ type: EVT.CRAFT_STARTED, data: { wizardId: wizard.id, recipeId: recipe.id } });
}

function cancelCraft(wizard: WizardState, bus: EventBus): void {
  if (!wizard.craft) return;
  wizard.craft = null;
  bus.emit({ type: EVT.CRAFT_CANCELLED, data: { wizardId: wizard.id } });
}

function completeCraft(wizard: WizardState, state: GameState, bus: EventBus): void {
  if (!wizard.craft) return;
  const recipe = getRecipe(wizard.craft.recipeId);
  if (!recipe) { wizard.craft = null; return; }

  // Deduct ingredients
  for (const ing of recipe.ingredients) {
    wizard.herbs[ing.herb] -= ing.amount;
  }

  // Add charge to slot
  const addResult = addChargeToSlots(wizard, recipe.resultSpell);
  wizard.craft = null;

  bus.emit({ type: EVT.CRAFT_COMPLETED, data: { wizardId: wizard.id, spellId: recipe.resultSpell, addResult } });

  if (addResult === 'overflow' && wizard.id === 0) {
    // Player needs to choose slot replacement
    state.phase = 'craftChoice';
    state.craftChoiceWizard = 0;
    state.craftChoiceRecipeId = recipe.resultSpell;
    state.craftChoiceOptions = wizard.slots.map((s, i) => s ? `${s.spellId}(${s.charges})` : `empty(${i})`);
    state.craftChoiceSelected = 0;
    state.craftChoiceType = 'slot';
    bus.emit({ type: EVT.PHASE_CHANGED, data: { phase: 'craftChoice' } });
  }
}

function addChargeToSlots(wizard: WizardState, spellId: string): 'added' | 'overflow' {
  // Try to stack
  for (const slot of wizard.slots) {
    if (slot && slot.spellId === spellId && slot.charges < MAX_CHARGES) {
      slot.charges++;
      return 'added';
    }
  }
  // Try empty slot
  for (let i = 0; i < wizard.slots.length; i++) {
    if (!wizard.slots[i]) {
      wizard.slots[i] = { spellId, charges: 1 };
      return 'added';
    }
  }
  // Overflow - for AI, auto-replace
  if (wizard.id === 1) {
    aiReplaceSlot(wizard, spellId);
    return 'added';
  }
  return 'overflow';
}

function aiReplaceSlot(wizard: WizardState, newSpellId: string): void {
  const costs: number[] = wizard.slots.map(s => {
    if (!s) return -1;
    const spell = getSpell(s.spellId);
    let cost = 0;
    if (s.spellId === 'fireball' || s.spellId === 'frostbolt') cost = 100;
    else if (s.spellId === 'heal') cost = 50;
    else cost = 0;
    return cost + s.charges;
  });

  let minIdx = 0;
  let minCost = costs[0];
  for (let i = 1; i < costs.length; i++) {
    if (costs[i] < minCost) { minCost = costs[i]; minIdx = i; }
  }
  wizard.slots[minIdx] = { spellId: newSpellId, charges: 1 };
}

export function playerReplaceSlot(state: GameState, slotIdx: number): void {
  if (state.craftChoiceWizard !== 0) return;
  const wizard = state.wizards[0];
  const spellId = state.craftChoiceRecipeId;
  if (!spellId) return;

  if (slotIdx >= 0 && slotIdx < MAX_SLOTS) {
    wizard.slots[slotIdx] = { spellId, charges: 1 };
  }
  // If -1 (cancel), spell is lost

  state.phase = 'playing';
  state.craftChoiceWizard = null;
  state.craftChoiceRecipeId = null;
}

function canCast(wizard: WizardState): boolean {
  if (wizard.dead) return false;
  if (wizard.craft) return false;
  const slot = wizard.slots[wizard.activeSlot];
  if (!slot || slot.charges <= 0) return false;
  if (wizard.gcd > 0) return false;
  const spell = getSpell(slot.spellId);
  if (!spell) return false;
  if ((wizard.cooldowns[spell.id] || 0) > 0) return false;
  return true;
}

function castSpell(wizard: WizardState, state: GameState, bus: EventBus): void {
  if (!canCast(wizard)) return;

  const slot = wizard.slots[wizard.activeSlot]!;
  const spell = getSpell(slot.spellId)!;

  slot.charges--;
  wizard.gcd = GCD;
  wizard.cooldowns[spell.id] = spell.cooldown;
  state.stats[wizard.id].spellsCast++;

  if (spell.type === 'attack') {
    // Create projectile
    const dir = dirToVec(wizard.facing);
    const lifetime = (spell.range * CELL) / spell.projectileSpeed;
    state.projectiles.push({
      id: state.nextProjectileId++,
      ownerId: wizard.id,
      spellId: spell.id,
      position: { ...wizard.position },
      direction: dir,
      speed: spell.projectileSpeed,
      radius: spell.projectileRadius,
      lifetime,
      maxLifetime: lifetime,
    });
  } else if (spell.type === 'heal') {
    const before = wizard.hp;
    wizard.hp = Math.min(wizard.maxHp, wizard.hp + spell.power);
    const actual = wizard.hp - before;
    bus.emit({ type: EVT.HEALTH_CHANGED, data: { wizardId: wizard.id, hp: wizard.hp, maxHp: wizard.maxHp } });
  } else if (spell.type === 'defense') {
    wizard.shieldTime = spell.power;
    bus.emit({ type: EVT.SHIELD_APPLIED, data: { wizardId: wizard.id, duration: spell.power } });
  }

  bus.emit({ type: EVT.CAST, data: { wizardId: wizard.id, spellId: spell.id } });
  bus.emit({ type: EVT.SPELLS_CHANGED, data: { wizardId: wizard.id } });
}

function applyDamage(target: WizardState, damage: number, attackerId: number, state: GameState, bus: EventBus): void {
  if (target.dead) return;

  // Shield reduction
  let actualDamage = damage;
  if (target.shieldTime > 0) {
    const spell = SPELLS.find(s => s.type === 'defense');
    const reduction = spell ? spell.damageReduction : 0.5;
    actualDamage = Math.round(damage * (1 - reduction));
  }

  const before = target.hp;
  target.hp = Math.max(0, target.hp - actualDamage);
  const realDamage = before - target.hp;

  state.stats[attackerId].damageDealt += realDamage;
  bus.emit({ type: EVT.DAMAGE_DEALT, data: { targetId: target.id, attackerId, damage: realDamage } });
  bus.emit({ type: EVT.HEALTH_CHANGED, data: { wizardId: target.id, hp: target.hp, maxHp: target.maxHp } });

  // Cancel craft on damage
  if (target.craft) {
    cancelCraft(target, bus);
  }

  if (target.hp <= 0) {
    target.dead = true;
    target.craft = null;
    bus.emit({ type: EVT.DEATH, data: { wizardId: target.id } });
  }
}

function updateProjectiles(state: GameState, grid: Grid, bus: EventBus, dt: number): void {
  const toRemove: number[] = [];

  for (let i = 0; i < state.projectiles.length; i++) {
    const p = state.projectiles[i];
    const dx = p.direction.x * p.speed * dt;
    const dy = p.direction.y * p.speed * dt;
    const oldPos = { ...p.position };
    p.position.x += dx;
    p.position.y += dy;
    p.lifetime -= dt;

    if (p.lifetime <= 0) {
      toRemove.push(i);
      continue;
    }

    // Check wall collision
    let hitWall = false;
    for (const wall of grid.walls) {
      if (segmentVsAABB(oldPos.x, oldPos.y, p.position.x, p.position.y, wall.x, wall.y, wall.w, wall.h)) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) { toRemove.push(i); continue; }

    // Check wizard collision
    let hitWizard = false;
    for (const w of state.wizards) {
      if (w.id === p.ownerId || w.dead) continue;
      if (segmentVsCircle(oldPos.x, oldPos.y, p.position.x, p.position.y, w.position.x, w.position.y, PROJECTILE_HIT_RADIUS)) {
        const spell = getSpell(p.spellId);
        if (spell) {
          applyDamage(w, spell.power, p.ownerId, state, bus);
        }
        bus.emit({ type: EVT.PROJECTILE_HIT, data: { projectileId: p.id, targetId: w.id } });
        hitWizard = true;
        break;
      }
    }
    if (hitWizard) { toRemove.push(i); continue; }
  }

  for (let i = toRemove.length - 1; i >= 0; i--) {
    state.projectiles.splice(toRemove[i], 1);
  }
}

function updateTimers(wizard: WizardState, dt: number): void {
  if (wizard.gcd > 0) wizard.gcd = Math.max(0, wizard.gcd - dt);
  if (wizard.shieldTime > 0) wizard.shieldTime = Math.max(0, wizard.shieldTime - dt);
  for (const key of Object.keys(wizard.cooldowns)) {
    wizard.cooldowns[key] = Math.max(0, wizard.cooldowns[key] - dt);
  }
}

function updateCraft(wizard: WizardState, state: GameState, bus: EventBus, dt: number): void {
  if (!wizard.craft) return;
  wizard.craft.progress += dt;
  if (wizard.craft.progress >= wizard.craft.duration) {
    completeCraft(wizard, state, bus);
  }
}

function checkWinCondition(state: GameState, bus: EventBus): void {
  if (state.result) return;

  const [w0, w1] = state.wizards;

  // Death takes priority
  if (w0.dead && w1.dead) {
    state.result = 'draw';
    bus.emit({ type: EVT.MATCH_ENDED, data: { result: 'draw' } });
    state.phase = 'finished';
    return;
  }
  if (w0.dead) {
    state.result = 'lose';
    bus.emit({ type: EVT.MATCH_ENDED, data: { result: 'lose' } });
    state.phase = 'finished';
    return;
  }
  if (w1.dead) {
    state.result = 'win';
    bus.emit({ type: EVT.MATCH_ENDED, data: { result: 'win' } });
    state.phase = 'finished';
    return;
  }

  // Timer
  if (state.mode === 'timed' && state.timeLeft <= 0) {
    state.timeLeft = 0;
    // Tiebreaker
    if (w0.hp > w1.hp) { state.result = 'win'; }
    else if (w1.hp > w0.hp) { state.result = 'lose'; }
    else if (state.stats[0].damageDealt > state.stats[1].damageDealt) { state.result = 'win'; }
    else if (state.stats[1].damageDealt > state.stats[0].damageDealt) { state.result = 'lose'; }
    else if (state.stats[0].herbsGathered > state.stats[1].herbsGathered) { state.result = 'win'; }
    else if (state.stats[1].herbsGathered > state.stats[0].herbsGathered) { state.result = 'lose'; }
    else { state.result = 'draw'; }
    bus.emit({ type: EVT.MATCH_ENDED, data: { result: state.result } });
    state.phase = 'finished';
  }
}

// Main step function
export function step(state: GameState, inputs: [InputFrame, InputFrame], grid: Grid, bus: EventBus, rng: Rng, dt: number = STEP): void {
  if (state.phase !== 'playing') return;

  state.tick++;
  const dtSec = dt;

  // Timer
  if (state.mode === 'timed' && state.timeLeft !== Infinity) {
    state.timeLeft -= dtSec;
  }

  // Herb respawn
  state.herbRespawnTimer -= dtSec;
  if (state.herbRespawnTimer <= 0) {
    state.herbRespawnTimer = HERB_RESPAWN_INTERVAL;
    respawnHerbs(state, rng);
  }

  // Process each wizard
  for (let i = 0; i < 2; i++) {
    const wizard = state.wizards[i];
    const input = inputs[i];

    if (wizard.dead) continue;

    // Movement
    if (!wizard.craft) {
      moveWizard(wizard, input.move, grid, dtSec);
    }

    // Pickup herbs
    pickupHerbs(wizard, state, bus);

    // Interact (craft)
    if (input.interact) {
      if (wizard.craft) {
        // Cancel craft
        cancelCraft(wizard, bus);
      } else if (isNearCauldron(wizard)) {
        // Только для ИИ - игрок использует интерфейс котла через gameController
        if (wizard.id === 1) {
          const available = getAvailableRecipes(wizard);
          if (available.length > 0) {
            const best = available.reduce((a, b) => a.priority < b.priority ? a : b);
            startCraft(wizard, best, state, bus);
          }
        }
      }
    }

    // Cast
    if (input.cast) {
      castSpell(wizard, state, bus);
    }

    // Slot switching
    if (input.nextSlot) {
      wizard.activeSlot = (wizard.activeSlot + 1) % MAX_SLOTS;
      bus.emit({ type: EVT.SLOT_CHANGED, data: { wizardId: wizard.id, slot: wizard.activeSlot } });
    }
    if (input.prevSlot) {
      wizard.activeSlot = (wizard.activeSlot - 1 + MAX_SLOTS) % MAX_SLOTS;
      bus.emit({ type: EVT.SLOT_CHANGED, data: { wizardId: wizard.id, slot: wizard.activeSlot } });
    }
    if (input.selectSlot !== null && input.selectSlot >= 0 && input.selectSlot < MAX_SLOTS) {
      wizard.activeSlot = input.selectSlot;
      bus.emit({ type: EVT.SLOT_CHANGED, data: { wizardId: wizard.id, slot: wizard.activeSlot } });
    }

    // Update timers
    updateTimers(wizard, dtSec);

    // Update craft
    updateCraft(wizard, state, bus, dtSec);
  }

  // Update projectiles
  updateProjectiles(state, grid, bus, dtSec);

  // Check win condition
  checkWinCondition(state, bus);

  // Save RNG state
  state.rngState = rng.getState();
}
