import { Rng } from "./rng";

type RngMode = "seeded" | "scripted";

export class DeterministicRng implements Rng {
  private readonly mode: RngMode;
  private state: number;
  private readonly values: number[];
  private idx = 0;

  private constructor(mode: RngMode, seed: number, values: number[]) {
    this.mode = mode;
    this.state = seed >>> 0;
    this.values = values.slice();
  }

  static seeded(seed: number): DeterministicRng {
    return new DeterministicRng("seeded", seed, []);
  }

  static scripted(values: number[]): DeterministicRng {
    return new DeterministicRng("scripted", 0, values);
  }

  nextInt(bound: number): number {
    if (bound <= 0) {
      return 0;
    }
    const raw = this.mode === "scripted"
      ? this.nextScripted()
      : this.nextXorShift32();
    return (raw % bound + bound) % bound;
  }

  nextBytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = this.nextInt(256);
    }
    return out;
  }

  private nextScripted(): number {
    if (this.idx >= this.values.length) {
      throw new Error("DeterministicRng scripted values exhausted");
    }
    const v = this.values[this.idx] as number;
    this.idx += 1;
    return v | 0;
  }

  private nextXorShift32(): number {
    let x = this.state || 0x6d2b79f5;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }
}
