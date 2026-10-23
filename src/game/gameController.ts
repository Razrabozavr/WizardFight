// Главный игровой контроллер

import type { GameState, InputFrame, GameSettings, MatchMode, MatchResult } from '../core/types';
import { STEP, MAP_WIDTH, MAP_HEIGHT, DEFAULT_SETTINGS } from '../core/constants';
import { createInitialState, step, createGrid, playerReplaceSlot, getSpell, getRecipe, RECIPES, MAP } from '../core/simulation';
import { EventBus, EVT } from '../core/events';
import { Rng } from '../core/rng';
import { Renderer } from '../render/renderer';
import { AudioManager } from '../audio/audioManager';
import { KeyboardInput, GamepadInput, LocalPlayerInput } from '../input/input';
import { AIInput } from '../ai/aiInput';
import type { Grid } from '../navigation/grid';

export type Screen = 'menu' | 'playing' | 'paused' | 'craftChoice' | 'result';

export interface GameCallbacks {
  onScreenChange: (screen: Screen) => void;
  onHpChange: (wizardId: number, hp: number, maxHp: number) => void;
  onSlotsChange: (slots: GameState['wizards'][0]['slots'], activeSlot: number) => void;
  onHerbsChange: (herbs: Record<string, number>) => void;
  onTimerChange: (timeLeft: number, mode: MatchMode) => void;
  onCraftProgress: (progress: number, duration: number) => void;
  onCraftChoice: (options: string[], selected: number) => void;
  onResult: (result: MatchResult, stats: { hp: number; damage: number; herbs: number }[]) => void;
  onCooldownChange: (cooldowns: Record<string, number>, gcd: number) => void;
  onShieldChange: (shieldTime: number) => void;
}

export class GameController {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: Renderer;
  private audio: AudioManager;
  private keyboard: KeyboardInput;
  private gamepad: GamepadInput;
  private bus: EventBus;
  private grid: Grid;
  private rng: Rng;
  private state: GameState | null = null;
  private localInput: LocalPlayerInput;
  private aiInput: AIInput;
  private callbacks: GameCallbacks;
  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private animFrameId = 0;
  private mode: MatchMode = 'timed';
  private duration = 120;
  private edgeConsumed = false;
  private lastCraftProgressEmit = 0;

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = MAP_WIDTH;
    this.canvas.height = MAP_HEIGHT;
    this.canvas.tabIndex = 0;
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.zIndex = '1';
    container.appendChild(this.canvas);

    this.renderer = new Renderer(this.canvas);
    this.audio = new AudioManager();
    this.keyboard = new KeyboardInput();
    this.gamepad = new GamepadInput();
    this.bus = new EventBus();
    this.grid = createGrid();
    this.rng = new Rng(Date.now());
    this.localInput = new LocalPlayerInput(this.keyboard, this.gamepad);
    this.aiInput = new AIInput(this.grid, this.rng, { x: 0, y: 0 });

    this.keyboard.attach();
    this.gamepad.attach();

    this.setupEventListeners();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Focus loss → pause
    window.addEventListener('blur', () => {
      if (this.state && this.state.phase === 'playing') {
        this.pause();
      }
    });
  }

  private setupEventListeners(): void {
    this.bus.on(EVT.HEALTH_CHANGED, (e) => {
      const wizId = e.data.wizardId as number;
      const hp = e.data.hp as number;
      const maxHp = e.data.maxHp as number;
      this.callbacks.onHpChange(wizId, hp, maxHp);
    });

    this.bus.on(EVT.SPELLS_CHANGED, (e) => {
      const wizId = e.data.wizardId as number;
      if (wizId === 0 && this.state) {
        this.callbacks.onSlotsChange([...this.state.wizards[0].slots], this.state.wizards[0].activeSlot);
      }
    });

    this.bus.on(EVT.SLOT_CHANGED, () => {
      if (this.state) {
        this.callbacks.onSlotsChange([...this.state.wizards[0].slots], this.state.wizards[0].activeSlot);
      }
    });

    this.bus.on(EVT.HERB_GATHERED, () => {
      if (this.state) {
        this.callbacks.onHerbsChange({ ...this.state.wizards[0].herbs });
      }
    });

    this.bus.on(EVT.CRAFT_STARTED, () => {
      this.audio.playCraft();
    });

    this.bus.on(EVT.CRAFT_COMPLETED, (e) => {
      this.audio.playCraftComplete();
      this.lastCraftProgressEmit = 0;
      this.callbacks.onCraftProgress(0, 0); // Signal end
      if (this.state) {
        this.callbacks.onSlotsChange([...this.state.wizards[0].slots], this.state.wizards[0].activeSlot);
        this.callbacks.onHerbsChange({ ...this.state.wizards[0].herbs });
      }
    });

    this.bus.on(EVT.CRAFT_CANCELLED, () => {
      this.lastCraftProgressEmit = 0;
      this.callbacks.onCraftProgress(0, 0); // Signal end
    });

    this.bus.on(EVT.CAST, (e) => {
      const wizId = e.data.wizardId as number;
      const spellId = e.data.spellId as string;
      const spell = getSpell(spellId);
      if (spell) {
        if (spell.type === 'attack') this.audio.playCast();
        else if (spell.type === 'heal') this.audio.playHeal();
        else this.audio.playCast();
      }
      if (wizId === 0 && this.state) {
        this.callbacks.onSlotsChange([...this.state.wizards[0].slots], this.state.wizards[0].activeSlot);
        this.callbacks.onCooldownChange({ ...this.state.wizards[0].cooldowns }, this.state.wizards[0].gcd);
      }
    });

    this.bus.on(EVT.PROJECTILE_HIT, () => {
      this.audio.playHit();
    });

    this.bus.on(EVT.DEATH, (e) => {
      const wizId = e.data.wizardId as number;
      this.audio.playDeath();
      if (this.state) {
        const pos = this.state.wizards[wizId].position;
        this.renderer.addParticle(pos.x, pos.y, '#ff0000', 20);
      }
    });

    this.bus.on(EVT.MATCH_ENDED, (e) => {
      const result = e.data.result as MatchResult;
      if (this.state) {
        if (result === 'win') this.audio.playVictory();
        else if (result === 'lose') this.audio.playDefeat();
        this.callbacks.onResult(result, [
          { hp: this.state.wizards[0].hp, damage: this.state.stats[0].damageDealt, herbs: this.state.stats[0].herbsGathered },
          { hp: this.state.wizards[1].hp, damage: this.state.stats[1].damageDealt, herbs: this.state.stats[1].herbsGathered },
        ]);
      }
    });

    this.bus.on(EVT.PHASE_CHANGED, (e) => {
      const phase = e.data.phase as string;
      if (phase === 'craftChoice' && this.state) {
        this.callbacks.onCraftChoice(this.state.craftChoiceOptions, this.state.craftChoiceSelected);
      }
    });
  }

  private resizeCanvas(): void {
    // Canvas keeps its internal resolution (MAP_WIDTH × MAP_HEIGHT)
    // CSS scales it to fit the container while preserving aspect ratio
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const aspect = MAP_WIDTH / MAP_HEIGHT;
    let w = containerWidth;
    let h = w / aspect;
    if (h > containerHeight) {
      h = containerHeight;
      w = h * aspect;
    }
    // Position canvas centered in container
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.style.left = `${(containerWidth - w) / 2}px`;
    this.canvas.style.top = `${(containerHeight - h) / 2}px`;
  }

  setMode(mode: MatchMode): void { this.mode = mode; }
  setDuration(d: number): void { this.duration = d; }
  setSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    (this.settings as unknown as Record<string, unknown>)[key] = value;
    if (key === 'volume') this.audio.setVolume(value as number);
    if (key === 'debugGrid') this.renderer.setDebugGrid(value as boolean);
    if (key === 'stickDeadzone') this.gamepad.setDeadzone(value as number);
  }
  getSettings(): GameSettings { return { ...this.settings }; }

  startMatch(): void {
    const seed = Date.now() ^ (Math.random() * 0xFFFFFFFF);
    this.rng = new Rng(seed);
    this.state = createInitialState(seed, this.mode, this.duration);
    this.aiInput = new AIInput(this.grid, this.rng, this.state.wizards[1].position);
    this.edgeConsumed = false;

    // Notify UI of initial state
    this.callbacks.onHpChange(0, this.state.wizards[0].hp, this.state.wizards[0].maxHp);
    this.callbacks.onHpChange(1, this.state.wizards[1].hp, this.state.wizards[1].maxHp);
    this.callbacks.onSlotsChange([...this.state.wizards[0].slots], 0);
    this.callbacks.onHerbsChange({ ...this.state.wizards[0].herbs });
    this.callbacks.onTimerChange(this.state.timeLeft, this.state.mode);
    this.callbacks.onCooldownChange({}, 0);
    this.callbacks.onShieldChange(0);

    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.canvas.focus();
    this.callbacks.onScreenChange('playing');
    this.gameLoop();
  }

  pause(): void {
    if (!this.state || this.state.phase !== 'playing') return;
    this.state.phase = 'paused';
    this.callbacks.onScreenChange('paused');
  }

  resume(): void {
    if (!this.state || this.state.phase !== 'paused') return;
    this.state.phase = 'playing';
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.callbacks.onScreenChange('playing');
  }

  restart(): void {
    this.stop();
    this.startMatch();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
    this.state = null;
  }

  goToMenu(): void {
    this.stop();
    this.state = null;
    this.callbacks.onScreenChange('menu');
  }

  handleCraftChoice(idx: number): void {
    if (!this.state || this.state.phase !== 'craftChoice') return;

    if (this.state.craftChoiceType === 'recipe') {
      // Choosing which recipe to craft
      if (idx >= 0 && idx < this.state.craftChoiceOptions.length) {
        const recipeId = this.state.craftChoiceOptions[idx];
        const recipe = RECIPES.find(r => r.id === recipeId);
        if (recipe) {
          const wizard = this.state.wizards[this.state.craftChoiceWizard!];
          const reserved: Record<string, number> = {};
          for (const ing of recipe.ingredients) {
            reserved[ing.herb] = ing.amount;
          }
          wizard.craft = {
            recipeId: recipe.id,
            progress: 0,
            duration: Math.max(1.0, recipe.craftTime),
            reservedIngredients: reserved,
          };
          this.bus.emit({ type: EVT.CRAFT_STARTED, data: { wizardId: wizard.id, recipeId: recipe.id } });
        }
      }
    } else if (this.state.craftChoiceType === 'slot') {
      // Choosing which slot to replace (overflow)
      const wizard = this.state.wizards[0];
      const newSpellId = this.state.craftChoiceRecipeId;
      if (idx >= 0 && idx < 3 && newSpellId) {
        wizard.slots[idx] = { spellId: newSpellId, charges: 1 };
        this.bus.emit({ type: EVT.SPELLS_CHANGED, data: { wizardId: 0 } });
      }
      // If idx < 0 (cancel), spell is lost
    }

    this.state.phase = 'playing';
    this.state.craftChoiceWizard = null;
    this.state.craftChoiceRecipeId = null;
    this.callbacks.onScreenChange('playing');
  }

  private gameLoop = (): void => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.gameLoop);

    const now = performance.now();
    let frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameTime > 0.25) frameTime = 0.25;

    if (!this.state) {
      // Clear canvas when in menu
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      }
      return;
    }

    if (this.state.phase === 'playing') {
      this.accumulator += frameTime;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.accumulator -= STEP;

        // Read inputs
        const playerInput = this.localInput.read(this.state.tick);
        const aiInputFrame = this.aiInput.readWithState(this.state.tick, this.state);

        // Edge triggers only on first step
        if (steps > 0) {
          playerInput.cast = false;
          playerInput.interact = false;
          playerInput.nextSlot = false;
          playerInput.prevSlot = false;
          playerInput.selectSlot = null;
          playerInput.pause = false;
          playerInput.confirm = false;
          playerInput.back = false;
          playerInput.cancel = false;
        }

        // Handle pause
        if (playerInput.pause && steps === 0) {
          this.pause();
          return;
        }

        step(this.state, [playerInput, aiInputFrame], this.grid, this.bus, this.rng, STEP);

        // Emit craft progress
        if (this.state.wizards[0].craft) {
          const elapsed = this.state.tick * STEP;
          if (elapsed - this.lastCraftProgressEmit >= 0.1) {
            this.lastCraftProgressEmit = elapsed;
            this.callbacks.onCraftProgress(this.state.wizards[0].craft.progress, this.state.wizards[0].craft.duration);
          }
        } else {
          if (this.lastCraftProgressEmit > 0) {
            this.lastCraftProgressEmit = 0;
          }
        }

        // Update timer display
        this.callbacks.onTimerChange(this.state.timeLeft, this.state.mode);

        // Update cooldowns display
        this.callbacks.onCooldownChange({ ...this.state.wizards[0].cooldowns }, this.state.wizards[0].gcd);
        this.callbacks.onShieldChange(this.state.wizards[0].shieldTime);

        steps++;
      }
    }

    // Handle craft choice input
    if (this.state.phase === 'craftChoice') {
      const input = this.localInput.read(this.state.tick);
      if (input.move === 'left' || input.prevSlot) {
        this.state.craftChoiceSelected = Math.max(0, this.state.craftChoiceSelected - 1);
        this.callbacks.onCraftChoice(this.state.craftChoiceOptions, this.state.craftChoiceSelected);
      }
      if (input.move === 'right' || input.nextSlot) {
        this.state.craftChoiceSelected = Math.min(this.state.craftChoiceOptions.length - 1, this.state.craftChoiceSelected + 1);
        this.callbacks.onCraftChoice(this.state.craftChoiceOptions, this.state.craftChoiceSelected);
      }
      if (input.confirm) {
        this.handleCraftChoice(this.state.craftChoiceSelected);
      }
      if (input.back || input.cancel) {
        // Cancel - lose the spell
        this.state.phase = 'playing';
        this.state.craftChoiceWizard = null;
        this.callbacks.onScreenChange('playing');
      }
    }

    // Pause input handled by React UI

    // Render
    this.renderer.updateParticles(frameTime);
    this.renderer.render(this.state, this.grid);
  };

  destroy(): void {
    this.stop();
    this.keyboard.detach();
    this.gamepad.detach();
    this.bus.clear();
    this.audio.destroy();
    if (this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
  }
}
