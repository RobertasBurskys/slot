import { Grid } from "./grid";
import {
  Symbol,
  Mode,
  Coord,
  Component,
  Cluster,
  SpinTranscript,
  CascadeStep,
} from "./types";
import { MultiplierGrid } from "./multiplierGrid";
import { GameConfig } from "../math/gameConfig";
import { PayTable } from "../math/payTable";
import { Rng } from "../rng/rng";
import { Samplers } from "../rng/samplers";
import { WeightedSampler } from "../rng/weightedSampler";

export type SymbolSampler = {
  sampleSymbol(rng: Rng): Symbol;
};

export type CascadeResult = {
  winX: number;
  bonusTriggered: boolean;
  capHit: boolean;
};

export type CascadeOutcome = {
  winX: number;
  bonusTriggered: boolean;
  capHit: boolean;
  numCascadeSteps: number;
};

type WildEdge = {
  wild: Coord;
  compId: number;
  score: number;
  baseSize: number;
  symbol: Symbol;
};

export function fillGrid(
  grid: Grid,
  sampler: SymbolSampler,
  rng: Rng,
): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.get(r, c) === Symbol.EMPTY) {
        grid.set(r, c, sampler.sampleSymbol(rng));
      }
    }
  }
}

export function countScatters(grid: Grid): number {
  let count = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.get(r, c) === Symbol.SCATTER) {
        count += 1;
      }
    }
  }
  return count;
}

export function findBaseComponents(grid: Grid): Component[] {
  const visited: boolean[][] = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.cols }, () => false),
  );
  const components: Component[] = [];
  let nextId = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const sym = grid.get(r, c);
      if (visited[r][c] || !isBaseSymbol(sym)) {
        continue;
      }
      const cells: Coord[] = [];
      const queue: Coord[] = [{ r, c }];
      let qIdx = 0;
      visited[r][c] = true;
      while (qIdx < queue.length) {
        const cur = queue[qIdx] as Coord;
        qIdx += 1;
        cells.push(cur);
        for (const n of neighborsN4(cur)) {
          if (!grid.inBounds(n.r, n.c) || visited[n.r][n.c]) {
            continue;
          }
          if (grid.get(n.r, n.c) !== sym) {
            continue;
          }
          visited[n.r][n.c] = true;
          queue.push(n);
        }
      }
      components.push({
        id: nextId,
        symbol: sym,
        cells,
        baseSize: cells.length,
      });
      nextId += 1;
    }
  }
  return components;
}

export function buildComponentIndex(
  components: Component[],
  rows: number,
  cols: number,
): number[][] {
  const idx = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => -1),
  );
  for (const comp of components) {
    for (const cell of comp.cells) {
      idx[cell.r][cell.c] = comp.id;
    }
  }
  return idx;
}

export function buildWildCandidates(
  grid: Grid,
  compIndex: number[][],
): Map<Coord, number[]> {
  const candidates = new Map<Coord, number[]>();
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.get(r, c) !== Symbol.WILD) {
        continue;
      }
      const comps = new Set<number>();
      for (const n of neighborsN4({ r, c })) {
        if (!grid.inBounds(n.r, n.c)) {
          continue;
        }
        const id = compIndex[n.r][n.c];
        if (id >= 0) {
          comps.add(id);
        }
      }
      if (comps.size > 0) {
        candidates.set({ r, c }, Array.from(comps.values()));
      }
    }
  }
  return candidates;
}

export function scoreWildEdge(
  wildCell: Coord,
  component: Component,
  payTable: PayTable,
): number {
  void wildCell;
  const s0 = component.baseSize;
  let delta = payTable(component.symbol, s0 + 1) - payTable(component.symbol, s0);
  if (s0 === 7) {
    delta += 0.001;
  } else if (s0 === 6) {
    delta += 0.0005;
  }
  return delta;
}

export function assignWildsGreedy(
  edgesSorted: WildEdge[],
): Map<Coord, number> {
  const assignments = new Map<Coord, number>();
  const assigned = new Set<string>();
  for (const edge of edgesSorted) {
    const key = coordKey(edge.wild);
    if (assigned.has(key)) {
      continue;
    }
    assignments.set(edge.wild, edge.compId);
    assigned.add(key);
  }
  return assignments;
}

export function buildFinalClusters(
  components: Component[],
  wildAssignments: Map<Coord, number>,
): Cluster[] {
  const clusters: Cluster[] = components.map((comp) => ({
    symbol: comp.symbol,
    cells: comp.cells.slice(),
    size: comp.baseSize,
  }));
  for (const [wild, compId] of wildAssignments.entries()) {
    const cluster = clusters[compId];
    if (!cluster) {
      continue;
    }
    cluster.cells.push(wild);
    cluster.size += 1;
  }
  return clusters;
}

export function computeClusterWin(
  cluster: Cluster,
  multGrid: MultiplierGrid,
  payTable: PayTable,
): number {
  if (cluster.size <= 0) {
    return 0;
  }
  const base = payTable(cluster.symbol, cluster.size);
  const prodMult = multGrid.productOver(cluster.cells);
  return base * prodMult;
}

export function applyWinsAndRemove(
  grid: Grid,
  multGrid: MultiplierGrid,
  clusters: Cluster[],
  onHitMultiplier = 2,
): void {
  for (const cluster of clusters) {
    for (const cell of cluster.cells) {
      multGrid.multiplyCoord(cell, onHitMultiplier);
      grid.set(cell.r, cell.c, Symbol.EMPTY);
    }
  }
}

export function dropDown(grid: Grid): void {
  for (let c = 0; c < grid.cols; c++) {
    let write = grid.rows - 1;
    for (let r = grid.rows - 1; r >= 0; r--) {
      const sym = grid.get(r, c);
      if (sym === Symbol.EMPTY) {
        continue;
      }
      if (write !== r) {
        grid.set(write, c, sym);
        grid.set(r, c, Symbol.EMPTY);
      }
      write -= 1;
    }
  }
}

export function refill(
  grid: Grid,
  sampler: SymbolSampler,
  rng: Rng,
): void {
  fillGrid(grid, sampler, rng);
}

export function cascadeLoop(
  mode: Mode,
  grid: Grid,
  multGrid: MultiplierGrid,
  samplers: Samplers,
  rng: Rng,
  config: GameConfig,
  transcript: SpinTranscript,
): CascadeResult {
  const sampler = mode === Mode.BONUS
    ? new ModeSampler(samplers.bonusSampler, true)
    : new ModeSampler(samplers.baseSampler, false);
  const outcome = runCascadesWithSampler(
    mode,
    grid,
    multGrid,
    sampler,
    rng,
    config,
    transcript,
  );
  return {
    winX: outcome.winX,
    bonusTriggered: outcome.bonusTriggered,
    capHit: outcome.capHit,
  };
}

export function runCascades(
  mode: Mode,
  grid: Grid,
  multGrid: MultiplierGrid,
  rng: Rng,
  config: GameConfig,
  transcript: SpinTranscript,
): CascadeOutcome {
  const weightsSampler = new WeightedSampler(config.weights);
  const sampler = new ModeSampler(
    weightsSampler,
    mode === Mode.BONUS,
  );
  return runCascadesWithSampler(
    mode,
    grid,
    multGrid,
    sampler,
    rng,
    config,
    transcript,
  );
}

export function runCascadesOnGrid(
  grid: Grid,
  multGrid: MultiplierGrid,
  mode: Mode,
  rng: Rng,
  config: GameConfig,
  transcript?: SpinTranscript,
): { outcome: CascadeOutcome; transcript: SpinTranscript } {
  const runTranscript = transcript ?? {
    initialGrid: grid.snapshot(),
    cascades: [],
  };
  const outcome = runCascades(
    mode,
    grid,
    multGrid,
    rng,
    config,
    runTranscript,
  );
  return { outcome, transcript: runTranscript };
}

function buildWildEdges(
  candidates: Map<Coord, number[]>,
  components: Component[],
  payTable: PayTable,
): WildEdge[] {
  const edges: WildEdge[] = [];
  for (const [wild, compIds] of candidates.entries()) {
    for (const compId of compIds) {
      const comp = components[compId];
      if (!comp) {
        continue;
      }
      edges.push({
        wild,
        compId,
        score: scoreWildEdge(wild, comp, payTable),
        baseSize: comp.baseSize,
        symbol: comp.symbol,
      });
    }
  }
  edges.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    if (a.baseSize !== b.baseSize) {
      return (b.baseSize + 1) - (a.baseSize + 1);
    }
    const rankA = symbolRank(a.symbol);
    const rankB = symbolRank(b.symbol);
    if (rankA !== rankB) {
      return rankB - rankA;
    }
    if (a.compId !== b.compId) {
      return a.compId - b.compId;
    }
    if (a.wild.r !== b.wild.r) {
      return a.wild.r - b.wild.r;
    }
    return a.wild.c - b.wild.c;
  });
  return edges;
}

function isBaseSymbol(sym: Symbol): boolean {
  return sym !== Symbol.EMPTY && sym !== Symbol.WILD && sym !== Symbol.SCATTER;
}

function neighborsN4(coord: Coord): Coord[] {
  return [
    { r: coord.r - 1, c: coord.c },
    { r: coord.r + 1, c: coord.c },
    { r: coord.r, c: coord.c - 1 },
    { r: coord.r, c: coord.c + 1 },
  ];
}

function coordKey(coord: Coord): string {
  return `${coord.r},${coord.c}`;
}

function symbolRank(symbol: Symbol): number {
  switch (symbol) {
    case Symbol.L1:
      return 1;
    case Symbol.L2:
      return 2;
    case Symbol.L3:
      return 3;
    case Symbol.L4:
      return 4;
    case Symbol.M1:
      return 5;
    case Symbol.M2:
      return 6;
    case Symbol.M3:
      return 7;
    case Symbol.M4:
      return 8;
    case Symbol.H1:
      return 9;
    case Symbol.H2:
      return 10;
    default:
      return 0;
  }
}

class ModeSampler implements SymbolSampler {
  private readonly sampler: WeightedSampler;
  private readonly inBonus: boolean;

  constructor(sampler: WeightedSampler, inBonus: boolean) {
    this.sampler = sampler;
    this.inBonus = inBonus;
  }

  sampleSymbol(rng: Rng): Symbol {
    return this.sampler.sampleSymbol(rng, this.inBonus);
  }
}

function runCascadesWithSampler(
  mode: Mode,
  grid: Grid,
  multGrid: MultiplierGrid,
  sampler: SymbolSampler,
  rng: Rng,
  config: GameConfig,
  transcript: SpinTranscript,
): CascadeOutcome {
  let winX = 0;
  let bonusTriggered = false;
  let capHit = false;
  let numCascadeSteps = 0;
  while (true) {
    const components = findBaseComponents(grid);
    const compIndex = buildComponentIndex(components, grid.rows, grid.cols);
    const wildCandidates = buildWildCandidates(grid, compIndex);
    const edges = buildWildEdges(
      wildCandidates,
      components,
      config.payTable,
    );
    const assignments = assignWildsGreedy(edges);
    const clusters = buildFinalClusters(components, assignments).filter(
      (c) => c.size >= config.minClusterSize,
    );
    if (clusters.length === 0) {
      break;
    }
    const wins = clusters.map((cluster) => ({
      cluster,
      winX: computeClusterWin(cluster, multGrid, config.payTable),
    }));
    let stepWin = 0;
    for (const win of wins) {
      stepWin += win.winX;
    }
    if (winX + stepWin > config.maxWinX) {
      return {
        winX: config.maxWinX,
        bonusTriggered,
        capHit: true,
        numCascadeSteps,
      };
    }
    winX += stepWin;
    applyWinsAndRemove(
      grid,
      multGrid,
      clusters,
      config.multiplier.onHitMultiplier,
    );
    dropDown(grid);
    refill(grid, sampler, rng);
    if (mode === Mode.BASE && countScatters(grid) >= config.bonus.triggerScatters) {
      bonusTriggered = true;
    }
    const step: CascadeStep = {
      clusters,
      wins,
      removed: clusters.flatMap((c) => c.cells),
      multiplierGrid: multGrid.snapshot(),
      gridAfter: grid.snapshot(),
    };
    transcript.cascades.push(step);
    numCascadeSteps += 1;
  }
  return { winX, bonusTriggered, capHit, numCascadeSteps };
}
