// Аудио менеджер — синтез через Web Audio API

export class AudioManager {
  private ctx: AudioContext | null = null;
  private volume = 0.5;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.initialized = true;
    } catch {
      console.warn('Web Audio API не поддерживается');
    }
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume: number = 1): void {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = this.volume * volume * 0.3;
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Ignore audio errors
    }
  }

  playCast(): void {
    this.playTone(440, 0.15, 'square', 0.5);
    this.playTone(660, 0.1, 'sine', 0.3);
  }

  playHit(): void {
    this.playTone(120, 0.2, 'sawtooth', 0.6);
  }

  playCraft(): void {
    this.playTone(330, 0.1, 'sine', 0.3);
    setTimeout(() => this.playTone(440, 0.1, 'sine', 0.3), 100);
    setTimeout(() => this.playTone(550, 0.15, 'sine', 0.3), 200);
  }

  playCraftComplete(): void {
    this.playTone(440, 0.1, 'sine', 0.4);
    setTimeout(() => this.playTone(660, 0.15, 'sine', 0.4), 100);
  }

  playHeal(): void {
    this.playTone(523, 0.15, 'sine', 0.4);
    setTimeout(() => this.playTone(659, 0.15, 'sine', 0.4), 100);
    setTimeout(() => this.playTone(784, 0.2, 'sine', 0.4), 200);
  }

  playDeath(): void {
    this.playTone(200, 0.3, 'sawtooth', 0.5);
    setTimeout(() => this.playTone(100, 0.5, 'sawtooth', 0.4), 200);
  }

  playVictory(): void {
    this.playTone(523, 0.2, 'sine', 0.5);
    setTimeout(() => this.playTone(659, 0.2, 'sine', 0.5), 200);
    setTimeout(() => this.playTone(784, 0.3, 'sine', 0.5), 400);
    setTimeout(() => this.playTone(1047, 0.4, 'sine', 0.5), 600);
  }

  playDefeat(): void {
    this.playTone(400, 0.3, 'sawtooth', 0.4);
    setTimeout(() => this.playTone(300, 0.3, 'sawtooth', 0.4), 300);
    setTimeout(() => this.playTone(200, 0.5, 'sawtooth', 0.4), 600);
  }

  playMenuSelect(): void {
    this.playTone(600, 0.05, 'sine', 0.2);
  }

  playMenuConfirm(): void {
    this.playTone(800, 0.08, 'sine', 0.3);
  }

  destroy(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.initialized = false;
    }
  }
}
