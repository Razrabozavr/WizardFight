// Основные типы игры

export type MoveDirection = 'none' | 'up' | 'down' | 'left' | 'right';
export type Phase = 'menu' | 'playing' | 'paused' | 'craftChoice' | 'finished';
export type SpellType = 'attack' | 'heal' | 'defense';
export type MatchMode = 'deathmatch' | 'timed';
export type HerbShape = 'flower' | 'leaf' | 'root';

export interface InputFrame {
  move: MoveDirection;
  cast: boolean;
  interact: boolean;
  nextSlot: boolean;
  prevSlot: boolean;
  selectSlot: number | null;
  cancel: boolean;
  pause: boolean;
  confirm: boolean;
  back: boolean;
}

export interface WizardInput {
  read(tick: number): InputFrame;
}

export interface SpellSlot {
  spellId: string;
  charges: number;
}

export interface CraftState {
  recipeId: string;
  progress: number;
  duration: number;
  reservedIngredients: Record<string, number>;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface WizardState {
  id: number;
  position: Vec2;
  facing: MoveDirection;
  hp: number;
  maxHp: number;
  activeSlot: number;
  slots: (SpellSlot | null)[];
  herbs: Record<string, number>;
  cooldowns: Record<string, number>;
  gcd: number;
  craft: CraftState | null;
  shieldTime: number;
  dead: boolean;
  lastKnownPlayerPosition: Vec2 | null;
  aiState: string;
  path: Vec2[];
  pathIndex: number;
  aiDecisionTimer: number;
  aiStuckTimer: number;
  aiStuckCount: number;
  aiLastPos: Vec2;
  aiWanderTimer: number;
  aiIdleTimer: number;
  aiFleeTimer: number;
  aiPathReplanTimer: number;
  aiForgetTimer: number;
  isPlayerVisible: boolean;
  lastSeenTime: number;
  hasValidLastKnown: boolean;
}

export interface HerbEntity {
  id: number;
  herbId: string;
  position: Vec2;
  spawnPoint: number;
}

export interface ProjectileEntity {
  id: number;
  ownerId: number;
  spellId: string;
  position: Vec2;
  direction: Vec2;
  speed: number;
  radius: number;
  lifetime: number;
  maxLifetime: number;
}

export interface MatchStats {
  damageDealt: number;
  herbsGathered: number;
  spellsCast: number;
}

export type MatchResult = 'win' | 'lose' | 'draw';

export interface GameState {
  seed: number;
  rngState: number;
  tick: number;
  phase: Phase;
  mode: MatchMode;
  timeLeft: number;
  wizards: [WizardState, WizardState];
  herbs: HerbEntity[];
  projectiles: ProjectileEntity[];
  stats: [MatchStats, MatchStats];
  result: MatchResult | null;
  herbRespawnTimer: number;
  nextHerbId: number;
  nextProjectileId: number;
  craftChoiceWizard: number | null;
  craftChoiceRecipeId: string | null;
  craftChoiceOptions: string[];
  craftChoiceSelected: number;
  craftChoiceType: 'recipe' | 'slot';
}

export interface GameEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface HerbData {
  id: string;
  displayName: string;
  color: string;
  shape: HerbShape;
  spawnWeight: number;
}

export interface SpellData {
  id: string;
  displayName: string;
  type: SpellType;
  power: number;
  cooldown: number;
  castTime: number;
  projectileSpeed: number;
  projectileRadius: number;
  range: number;
  damageReduction: number;
  color: string;
  priority: number;
}

export interface RecipeData {
  id: string;
  resultSpell: string;
  ingredients: { herb: string; amount: number }[];
  craftTime: number;
  priority: number;
}

export interface AIConfig {
  fleeHealthThreshold: number;
  detectionRadius: number;
  fieldOfView: number;
  attackRange: number;
  minRange: number;
  decisionInterval: number;
  forgetPlayerTime: number;
  pathReplanInterval: number;
  stuckTimeout: number;
}

export interface MatchConfig {
  mode: MatchMode;
  duration: number | null;
  isInfinite: boolean;
}

export interface MapData {
  width: number;
  height: number;
  cells: string;
  playerBase: [number, number];
  aiBase: [number, number];
  playerCauldron: [number, number];
  aiCauldron: [number, number];
  herbSpawnPoints: [number, number][];
}

export interface GameSettings {
  volume: number;
  screenShake: boolean;
  debugGrid: boolean;
  stickDeadzone: number;
}
