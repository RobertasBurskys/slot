import { GameConfig, WeightedCdfEntry, Weights } from "../math/gameConfig";
import { PayTable } from "../math/payTable";
import { Symbol, Mode } from "../engine/types";
import { Rng } from "../rng/rng";
import { DeterministicRng } from "../rng/deterministicRng";

export function createConfig(): GameConfig {
  const payTable: PayTable = (symbol: Symbol, size: number) => {
    const base = size;
    const scale = 0.05;
    switch (symbol) {
      case Symbol.H2:
        return base * 100.0 * scale;
      case Symbol.H1:
        return base * 80.0 * scale;
      case Symbol.M4:
        return base * 2.6 * scale;
      case Symbol.M3:
        return base * 1.6 * scale;
      case Symbol.M2:
        return base * 1.1 * scale;
      case Symbol.M1:
        return base * 0.9 * scale;
      default:
        return base * 0.4 * scale;
    }
  };
  const baseEntries: Array<[Symbol, number]> = [
    [Symbol.L1, 32],
    [Symbol.L2, 32],
    [Symbol.L3, 32],
    [Symbol.L4, 32],
    [Symbol.M1, 16],
    [Symbol.M2, 16],
    [Symbol.M3, 16],
    [Symbol.M4, 16],
    [Symbol.H1, 4],
    [Symbol.H2, 4],
    [Symbol.WILD, 10],
    [Symbol.SCATTER, 1],
  ];
  const bonusEntries: Array<[Symbol, number]> = [
    [Symbol.L1, 28],
    [Symbol.L2, 28],
    [Symbol.L3, 28],
    [Symbol.L4, 28],
    [Symbol.M1, 18],
    [Symbol.M2, 18],
    [Symbol.M3, 18],
    [Symbol.M4, 18],
    [Symbol.H1, 5],
    [Symbol.H2, 5],
    [Symbol.WILD, 8],
    [Symbol.SCATTER, 1],
  ];
  const weights = buildWeights(baseEntries, bonusEntries);
  return {
    rows: 8,
    cols: 8,
    minClusterSize: 4,
    adjacency: "N4",
    maxWinX: 15000,
    payTable,
    bonus: {
      triggerScatters: 4,
      bonusSpins: 10,
      bonusRetriggerSpins: 3,
      maxBonusExtraSpins: 1000,
    },
    multiplier: {
      initialCellMultiplier: 1,
      onHitMultiplier: 2,
      payoutMethod: "avg",
    },
    wildAssignment: {
      directAdjacencyOnly: true,
      deterministicTieBreak: true,
    },
    weights,
    mode: Mode.BASE,
  };
}

export function createRng(seed: number): Rng {
  return DeterministicRng.seeded(seed);
}

function buildWeights(
  baseEntries: Array<[Symbol, number]>,
  bonusEntries: Array<[Symbol, number]>,
): Weights {
  const base = new Map<Symbol, number>(baseEntries);
  const bonus = new Map<Symbol, number>(bonusEntries);
  const cdfBase: WeightedCdfEntry[] = [];
  const cdfBonus: WeightedCdfEntry[] = [];
  let cum = 0;
  for (const [symbol, weight] of baseEntries) {
    cum += weight;
    cdfBase.push({ symbol, cumWeight: cum });
  }
  const totalBase = cum;
  cum = 0;
  for (const [symbol, weight] of bonusEntries) {
    cum += weight;
    cdfBonus.push({ symbol, cumWeight: cum });
  }
  const totalBonus = cum;
  return { base, bonus, cdfBase, cdfBonus, totalBase, totalBonus };
}
