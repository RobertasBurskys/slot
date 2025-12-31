import { Symbol } from "../engine/types";
import { Weights } from "../math/gameConfig";
import { Rng } from "./rng";
import { uniformInt } from "./uniformRng";

export class WeightedSampler {
  private readonly weights: Weights;

  constructor(weights: Weights) {
    this.weights = weights;
  }

  sampleSymbol(rng: Rng, inBonus: boolean): Symbol {
    const cdf = inBonus ? this.weights.cdfBonus : this.weights.cdfBase;
    const total = inBonus ? this.weights.totalBonus : this.weights.totalBase;
    const roll = uniformInt(rng, total);
    const idx = this.findFirstGreater(cdf, roll);
    return cdf[idx]?.symbol ?? Symbol.EMPTY;
  }

  private findFirstGreater(
    cdf: { cumWeight: number }[],
    r: number,
  ): number {
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (r < cdf[mid].cumWeight) {
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return Math.max(0, Math.min(lo, cdf.length - 1));
  }
}
