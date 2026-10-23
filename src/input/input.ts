// Ввод с клавиатуры и геймпада

import type { InputFrame, MoveDirection, WizardInput, GameSettings } from '../core/types';
import { STICK_DEADZONE_DEFAULT } from '../core/constants';

function emptyInput(): InputFrame {
  return {
    move: 'none', cast: false, interact: false,
    nextSlot: false, prevSlot: false, selectSlot: null,
    cancel: false, pause: false, confirm: false, back: false,
  };
}

export class KeyboardInput {
  private keys: Set<string> = new Set();
  private edgeKeys: Set<string> = new Set();
  private lastAxis: 'x' | 'y' | null = null;
  private lastDir: MoveDirection = 'none';

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  attach(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.keys.clear();
    this.edgeKeys.clear();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.repeat) return;

    const key = e.key.toLowerCase();
    this.keys.add(key);
    this.edgeKeys.add(key);

    // Prevent default for game keys
    const gameKeys = ['w', 'a', 's', 'd', ' ', 'f', 'e', 'q', '1', '2', '3', 'escape', 'enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'f3'];
    if (gameKeys.includes(key)) {
      e.preventDefault();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keys.delete(key);
  }

  read(): InputFrame {
    const frame = emptyInput();

    // Movement - last pressed axis wins
    const w = this.keys.has('w') || this.keys.has('arrowup');
    const s = this.keys.has('s') || this.keys.has('arrowdown');
    const a = this.keys.has('a') || this.keys.has('arrowleft');
    const d = this.keys.has('d') || this.keys.has('arrowright');

    // Determine axis priority
    const yPressed = w || s;
    const xPressed = a || d;

    if (this.edgeKeys.has('w') || this.edgeKeys.has('arrowup') ||
        this.edgeKeys.has('s') || this.edgeKeys.has('arrowdown')) {
      this.lastAxis = 'y';
    }
    if (this.edgeKeys.has('a') || this.edgeKeys.has('arrowleft') ||
        this.edgeKeys.has('d') || this.edgeKeys.has('arrowright')) {
      this.lastAxis = 'x';
    }

    if (yPressed && xPressed) {
      if (this.lastAxis === 'y') {
        frame.move = w ? 'up' : 'down';
      } else if (this.lastAxis === 'x') {
        frame.move = a ? 'left' : 'right';
      } else {
        frame.move = 'none';
      }
    } else if (yPressed) {
      frame.move = w ? 'up' : 'down';
    } else if (xPressed) {
      frame.move = a ? 'left' : 'right';
    }

    // Edge-triggered actions
    frame.cast = this.edgeKeys.has(' ');
    frame.interact = this.edgeKeys.has('f');
    frame.nextSlot = this.edgeKeys.has('e');
    frame.prevSlot = this.edgeKeys.has('q');
    frame.pause = this.edgeKeys.has('escape');
    frame.confirm = this.edgeKeys.has('enter');
    frame.back = this.edgeKeys.has('escape');
    frame.cancel = this.edgeKeys.has('f');

    if (this.edgeKeys.has('1')) frame.selectSlot = 0;
    if (this.edgeKeys.has('2')) frame.selectSlot = 1;
    if (this.edgeKeys.has('3')) frame.selectSlot = 2;

    // Clear edge keys after reading
    this.edgeKeys.clear();

    return frame;
  }

  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }
}

export class GamepadInput {
  private prevButtons: boolean[] = [];
  private prevStickDir: MoveDirection = 'none';
  private deadzone: number;
  private connected = false;
  private gamepadIndex = -1;

  constructor(deadzone: number = STICK_DEADZONE_DEFAULT) {
    this.deadzone = deadzone;
    this.handleConnect = this.handleConnect.bind(this);
    this.handleDisconnect = this.handleDisconnect.bind(this);
  }

  attach(): void {
    window.addEventListener('gamepadconnected', this.handleConnect);
    window.addEventListener('gamepaddisconnected', this.handleDisconnect);
  }

  detach(): void {
    window.removeEventListener('gamepadconnected', this.handleConnect);
    window.removeEventListener('gamepaddisconnected', this.handleDisconnect);
  }

  private handleConnect(e: GamepadEvent): void {
    this.connected = true;
    this.gamepadIndex = e.gamepad.index;
  }

  private handleDisconnect(): void {
    this.connected = false;
    this.gamepadIndex = -1;
  }

  isConnected(): boolean { return this.connected; }

  setDeadzone(dz: number): void { this.deadzone = dz; }

  read(): InputFrame {
    const frame = emptyInput();
    if (!this.connected) return frame;

    const gamepads = navigator.getGamepads();
    const gp = gamepads[this.gamepadIndex];
    if (!gp) return frame;

    // D-Pad (buttons 12-15) has priority
    const dpadUp = gp.buttons[12]?.pressed;
    const dpadDown = gp.buttons[13]?.pressed;
    const dpadLeft = gp.buttons[14]?.pressed;
    const dpadRight = gp.buttons[15]?.pressed;

    let stickDir: MoveDirection = 'none';
    if (!dpadUp && !dpadDown && !dpadLeft && !dpadRight) {
      // Use stick
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;
      if (Math.abs(lx) > this.deadzone || Math.abs(ly) > this.deadzone) {
        if (Math.abs(lx) > Math.abs(ly)) {
          stickDir = lx > 0 ? 'right' : 'left';
        } else {
          stickDir = ly > 0 ? 'down' : 'up';
        }
      }
    }

    if (dpadUp) frame.move = 'up';
    else if (dpadDown) frame.move = 'down';
    else if (dpadLeft) frame.move = 'left';
    else if (dpadRight) frame.move = 'right';
    else frame.move = stickDir;

    // Edge detection for buttons
    const buttons = [
      gp.buttons[0]?.pressed || false, // A - cast/confirm
      gp.buttons[1]?.pressed || false, // B - back
      gp.buttons[2]?.pressed || false, // X - interact
      gp.buttons[4]?.pressed || false, // LB - prev slot
      gp.buttons[5]?.pressed || false, // RB - next slot
      gp.buttons[9]?.pressed || false, // Start - pause
    ];

    frame.cast = buttons[0] && !this.prevButtons[0];
    frame.confirm = buttons[0] && !this.prevButtons[0];
    frame.back = buttons[1] && !this.prevButtons[1];
    frame.interact = buttons[2] && !this.prevButtons[2];
    frame.prevSlot = buttons[3] && !this.prevButtons[3];
    frame.nextSlot = buttons[4] && !this.prevButtons[4];
    frame.pause = buttons[5] && !this.prevButtons[5];

    this.prevButtons = [...buttons];
    this.prevStickDir = stickDir;

    return frame;
  }
}

// Combined local player input
export class LocalPlayerInput implements WizardInput {
  private keyboard: KeyboardInput;
  private gamepad: GamepadInput;

  constructor(keyboard: KeyboardInput, gamepad: GamepadInput) {
    this.keyboard = keyboard;
    this.gamepad = gamepad;
  }

  read(_tick: number): InputFrame {
    const kb = this.keyboard.read();
    const gp = this.gamepad.read();

    // Merge: gamepad overrides if connected and has input
    if (this.gamepad.isConnected()) {
      if (gp.move !== 'none') kb.move = gp.move;
      if (gp.cast) kb.cast = true;
      if (gp.interact) kb.interact = true;
      if (gp.nextSlot) kb.nextSlot = true;
      if (gp.prevSlot) kb.prevSlot = true;
      if (gp.pause) kb.pause = true;
      if (gp.confirm) kb.confirm = true;
      if (gp.back) kb.back = true;
    }

    return kb;
  }
}

// Menu input adapter
export class MenuInput {
  private keyboard: KeyboardInput;
  private gamepad: GamepadInput;

  constructor(keyboard: KeyboardInput, gamepad: GamepadInput) {
    this.keyboard = keyboard;
    this.gamepad = gamepad;
  }

  read(): InputFrame {
    const kb = this.keyboard.read();
    const gp = this.gamepad.read();

    if (this.gamepad.isConnected()) {
      if (gp.move !== 'none') kb.move = gp.move;
      if (gp.confirm) kb.confirm = true;
      if (gp.back) kb.back = true;
    }

    return kb;
  }
}
