import { Symbol, Mode } from "../engine/types";
import { PayTable } from "./payTable";

export type Adjacency = "N4";

export type BonusConfig = {
  triggerScatters: number;
  bonusSpins: number;
  bonusRetriggerSpins: number;
  maxBonusExtraSpins?: number;
};

export type MultiplierConfig = {
  initialCellMultiplier: number;
  onHitMultiplier: number;
  payoutMethod: "avg";
};

export type WildAssignmentConfig = {
  directAdjacencyOnly: boolean;
  deterministicTieBreak: boolean;
};

export type Weights = {
  base: Map<Symbol, number>;
  bonus: Map<Symbol, number>;
  cdfBase: WeightedCdfEntry[];
  cdfBonus: WeightedCdfEntry[];
  totalBase: number;
  totalBonus: number;
};

export type WeightedCdfEntry = {
  symbol: Symbol;
  cumWeight: number;
};

export type GameConfig = {
  rows: number;
  cols: number;
  minClusterSize: number;
  adjacency: Adjacency;
  maxWinX: number;
  payTable: PayTable;
  bonus: BonusConfig;
  multiplier: MultiplierConfig;
  wildAssignment: WildAssignmentConfig;
  weights: Weights;
  mode: Mode;
};
