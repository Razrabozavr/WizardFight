// Генератор псевдослучайных чисел Mulberry32

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  getState(): number {
    return this.state;
  }

  setState(s: number): void {
    this.state = s;
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
