// Рендерер Canvas 2D

import type { GameState, Vec2, WizardState, HerbEntity, ProjectileEntity } from '../core/types';
import { CELL, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT, WIZARD_HALF } from '../core/constants';
import { MAP, HERBS, SPELLS, getSpell, getHerb } from '../core/simulation';
import type { Grid } from '../navigation/grid';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private debugGrid = false;
  private particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    canvas.width = MAP_WIDTH;
    canvas.height = MAP_HEIGHT;
  }

  setDebugGrid(v: boolean): void { this.debugGrid = v; }

  addParticle(x: number, y: number, color: string, count: number = 5): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 40;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.5 + Math.random() * 0.5,
        maxLife: 1,
        color,
        size: 2 + Math.random() * 3,
      });
    }
    if (this.particles.length > 200) {
      this.particles = this.particles.slice(-200);
    }
  }

  updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  render(state: GameState, grid: Grid): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw floor
    ctx.fillStyle = '#2a2a3e';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw debug grid
    if (this.debugGrid) {
      for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
          if (grid.walkable[r][c]) {
            ctx.fillStyle = 'rgba(0,255,0,0.1)';
          } else {
            ctx.fillStyle = 'rgba(255,0,0,0.2)';
          }
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
        }
      }
    }

    // Draw walls
    for (const wall of grid.walls) {
      ctx.fillStyle = '#4a4a5e';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.strokeStyle = '#333344';
      ctx.lineWidth = 1;
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    }

    // Draw cauldrons
    this.drawCauldron(ctx, MAP.playerCauldron[0], MAP.playerCauldron[1], state.wizards[0].craft !== null);
    this.drawCauldron(ctx, MAP.aiCauldron[0], MAP.aiCauldron[1], state.wizards[1].craft !== null);

    // Draw herbs
    for (const herb of state.herbs) {
      this.drawHerb(ctx, herb);
    }

    // Draw wizards
    for (const wizard of state.wizards) {
      if (!wizard.dead) {
        this.drawWizard(ctx, wizard);
      }
    }

    // Draw projectiles
    for (const proj of state.projectiles) {
      this.drawProjectile(ctx, proj);
    }

    // Draw particles
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Draw craft progress bars
    for (const wizard of state.wizards) {
      if (wizard.craft) {
        const cauldronPos = wizard.id === 0
          ? { x: (MAP.playerCauldron[0] + 0.5) * CELL, y: (MAP.playerCauldron[1] + 0.5) * CELL }
          : { x: (MAP.aiCauldron[0] + 0.5) * CELL, y: (MAP.aiCauldron[1] + 0.5) * CELL };
        const progress = wizard.craft.progress / wizard.craft.duration;
        const barWidth = 40;
        const barHeight = 6;
        const bx = cauldronPos.x - barWidth / 2;
        const by = cauldronPos.y - 24;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barWidth, barHeight);
        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(bx, by, barWidth * progress, barHeight);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barWidth, barHeight);
      }
    }

    // Draw AI path in debug mode
    if (this.debugGrid && state.wizards[1].path && state.wizards[1].path.length > 0) {
      ctx.strokeStyle = 'rgba(255,255,0,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(state.wizards[1].position.x, state.wizards[1].position.y);
      for (const p of state.wizards[1].path) {
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }

  private drawCauldron(ctx: CanvasRenderingContext2D, col: number, row: number, active: boolean): void {
    const x = (col + 0.5) * CELL;
    const y = (row + 0.5) * CELL;
    const r = 12;

    // Cauldron body
    ctx.fillStyle = '#2a1a1a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#665544';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Bubbles when active
    if (active) {
      const t = Date.now() / 500;
      for (let i = 0; i < 3; i++) {
        const bx = x + Math.sin(t + i * 2) * 5;
        const by = y - 5 - Math.abs(Math.sin(t * 1.5 + i)) * 8;
        ctx.fillStyle = 'rgba(100, 255, 100, 0.6)';
        ctx.beginPath();
        ctx.arc(bx, by, 2 + Math.sin(t + i) * 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHerb(ctx: CanvasRenderingContext2D, herb: HerbEntity): void {
    const data = getHerb(herb.herbId);
    if (!data) return;
    const { x, y } = herb.position;

    ctx.fillStyle = data.color;
    if (data.shape === 'flower') {
      // Flower: circle with petals
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (data.shape === 'leaf') {
      // Leaf: ellipse
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 7, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Root: irregular shape
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 5);
      ctx.lineTo(x - 2, y - 5);
      ctx.lineTo(x + 2, y - 4);
      ctx.lineTo(x + 4, y + 5);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawWizard(ctx: CanvasRenderingContext2D, wizard: WizardState): void {
    const { x, y } = wizard.position;
    const isPlayer = wizard.id === 0;
    const color = isPlayer ? '#4488ff' : '#ff4444';
    const hatColor = isPlayer ? '#2255cc' : '#cc2222';

    // Shield effect
    if (wizard.shieldTime > 0) {
      ctx.strokeStyle = 'rgba(255, 204, 0, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y + 2, 10, 0, Math.PI * 2);
    ctx.fill();

    // Hat (triangle)
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 4);
    ctx.lineTo(x, y - 18);
    ctx.lineTo(x + 8, y - 4);
    ctx.closePath();
    ctx.fill();

    // Facing indicator
    const facingDir = wizard.facing;
    let fx = 0, fy = 0;
    if (facingDir === 'right') fx = 1;
    else if (facingDir === 'left') fx = -1;
    else if (facingDir === 'down') fy = 1;
    else if (facingDir === 'up') fy = -1;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + fx * 4, y + fy * 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Player marker (star for player, circle for AI)
    if (isPlayer) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', x, y - 20);
    }
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, proj: ProjectileEntity): void {
    const spell = getSpell(proj.spellId);
    const color = spell ? spell.color : '#ffffff';

    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(proj.position.x, proj.position.y, proj.radius, 0, Math.PI * 2);
    ctx.fill();

    // Trail
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = color;
    const tx = proj.position.x - proj.direction.x * 8;
    const ty = proj.position.y - proj.direction.y * 8;
    ctx.beginPath();
    ctx.arc(tx, ty, proj.radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
