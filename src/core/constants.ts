// Константы игры

export const CELL = 32;
export const MAP_COLS = 32;
export const MAP_ROWS = 18;
export const MAP_WIDTH = MAP_COLS * CELL;
export const MAP_HEIGHT = MAP_ROWS * CELL;
export const WIZARD_SIZE = 24;
export const WIZARD_HALF = WIZARD_SIZE / 2;
export const MOVE_SPEED = 128;
export const PICKUP_DIST = 20;
export const CAULDRON_INTERACT_DIST = 48;
export const PROJECTILE_HIT_RADIUS = 12;
export const STEP = 1 / 60;
export const GCD = 0.5;
export const MAX_HP = 100;
export const HERB_RESPAWN_INTERVAL = 2;
export const MIN_HERBS_PER_TYPE = 3;
export const TOTAL_HERBS = 18;
export const MAX_CHARGES = 3;
export const MAX_SLOTS = 3;
export const MAX_PARTICLES = 200;
export const WAYPOINT_THRESHOLD = 4;
export const ASTAR_MAX_NODES = 5000;
export const ASTAR_MAX_PATH = 200;
export const STICK_DEADZONE_DEFAULT = 0.3;

export const DEFAULT_SETTINGS = {
  volume: 0.5,
  screenShake: true,
  debugGrid: false,
  stickDeadzone: STICK_DEADZONE_DEFAULT,
};
