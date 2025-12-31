export enum Symbol {
  L1 = "L1",
  L2 = "L2",
  L3 = "L3",
  L4 = "L4",
  M1 = "M1",
  M2 = "M2",
  M3 = "M3",
  M4 = "M4",
  H1 = "H1",
  H2 = "H2",
  WILD = "WILD",
  SCATTER = "SCATTER",
  EMPTY = "EMPTY",
}

export enum Mode {
  BASE = "BASE",
  BONUS = "BONUS",
}

export type Coord = {
  r: number;
  c: number;
};

export type Component = {
  id: number;
  symbol: Symbol;
  cells: Coord[];
  baseSize: number;
};

export type Cluster = {
  symbol: Symbol;
  cells: Coord[];
  size: number;
};

export type ClusterWin = {
  cluster: Cluster;
  winX: number;
};

export type CascadeStep = {
  clusters: Cluster[];
  wins: ClusterWin[];
  removed: Coord[];
  multiplierGrid?: number[][];
  gridAfter: Symbol[][];
};

export type SpinResult = {
  totalWinX: number;
  baseWinX: number;
  bonusWinX: number;
  bonusTriggered: boolean;
  bonusSpinsPlayed: number;
  capHit: boolean;
};

export type SpinTranscript = {
  initialGrid: Symbol[][];
  cascades: CascadeStep[];
  bonus?: {
    spins: SpinTranscript[];
  };
};
