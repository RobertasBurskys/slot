import * as assert from "assert";
import {
  Grid,
  MultiplierGrid,
  Symbol,
  Mode,
  findBaseComponents,
  applyWinsAndRemove,
  dropDown,
  computeClusterWin,
  runCascadesOnGrid,
  spin,
} from "../engine";
import { GameConfig, Weights, WeightedCdfEntry } from "../math/gameConfig";
import { PayTable } from "../math/payTable";
import { DeterministicRng } from "./deterministicRng";

type TestCase = {
  name: string;
  fn: () => void;
};

const tests: TestCase[] = [];

function test(name: string, fn: () => void): void {
  tests.push({ name, fn });
}

function run(): void {
  let passed = 0;
  let failed = 0;
  for (const t of tests) {
    try {
      t.fn();
      passed += 1;
      console.log(`ok - ${t.name}`);
    } catch (err) {
      failed += 1;
      console.error(`fail - ${t.name}`);
      console.error(err);
    }
  }
  console.log(`tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

function buildWeights(entries: Array<[Symbol, number]>): Weights {
  const base = new Map<Symbol, number>(entries);
  const bonus = new Map<Symbol, number>(entries);
  const cdfBase: WeightedCdfEntry[] = [];
  const cdfBonus: WeightedCdfEntry[] = [];
  let cum = 0;
  for (const [symbol, weight] of entries) {
    cum += weight;
    cdfBase.push({ symbol, cumWeight: cum });
  }
  const totalBase = cum;
  cum = 0;
  for (const [symbol, weight] of entries) {
    cum += weight;
    cdfBonus.push({ symbol, cumWeight: cum });
  }
  const totalBonus = cum;
  return { base, bonus, cdfBase, cdfBonus, totalBase, totalBonus };
}

function makeConfig(options?: Partial<GameConfig>): GameConfig {
  const payTable: PayTable = (symbol: Symbol, size: number) => {
    void symbol;
    return size;
  };
  const weights = buildWeights([
    [Symbol.SCATTER, 1],
  ]);
  return {
    rows: 8,
    cols: 8,
    minClusterSize: 8,
    adjacency: "N4",
    maxWinX: 15000,
    payTable,
    bonus: {
      triggerScatters: 3,
      bonusSpins: 10,
      bonusRetriggerSpins: 3,
      maxBonusExtraSpins: 15,
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
    ...options,
  };
}

function setCells(grid: Grid, cells: Array<[number, number, Symbol]>): void {
  for (const [r, c, sym] of cells) {
    grid.set(r, c, sym);
  }
}

function firstCascadeClusters(config: GameConfig, grid: Grid) {
  const multGrid = new MultiplierGrid(config.rows, config.cols, 1);
  const rng = DeterministicRng.seeded(1);
  const { transcript } = runCascadesOnGrid(
    grid,
    multGrid,
    Mode.BASE,
    rng,
    config,
  );
  assert.ok(transcript.cascades.length > 0);
  return transcript.cascades[0].clusters;
}

test("Cluster: 8 in a row -> one cluster size 8", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  for (let c = 0; c < 8; c++) {
    grid.set(0, c, Symbol.L1);
  }
  const comps = findBaseComponents(grid);
  assert.strictEqual(comps.length, 1);
  assert.strictEqual(comps[0]?.baseSize, 8);
});

test("Cluster: two separate clusters same symbol", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [0, 1, Symbol.L1],
    [0, 3, Symbol.L1],
    [0, 4, Symbol.L1],
  ]);
  const comps = findBaseComponents(grid);
  assert.strictEqual(comps.length, 2);
});

test("Cluster: diagonal does not connect", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [1, 1, Symbol.L1],
  ]);
  const comps = findBaseComponents(grid);
  assert.strictEqual(comps.length, 2);
});

test("Wild: touches exactly one component -> assigned", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [0, 1, Symbol.L1],
    [0, 2, Symbol.WILD],
  ]);
  const config = makeConfig({ minClusterSize: 1 });
  const clusters = firstCascadeClusters(config, grid);
  const l1 = clusters.find((c) => c.symbol === Symbol.L1);
  assert.ok(l1);
  assert.strictEqual(l1?.size, 3);
});

test("Wild: touches two components -> higher delta wins", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [1, 0, Symbol.L1],
    [0, 2, Symbol.H2],
    [1, 2, Symbol.H2],
    [0, 1, Symbol.WILD],
  ]);
  const payTable: PayTable = (symbol: Symbol, size: number) => {
    const weight = symbol === Symbol.H2 ? 2 : 1;
    return weight * size;
  };
  const config = makeConfig({
    minClusterSize: 1,
    payTable,
  });
  const clusters = firstCascadeClusters(config, grid);
  const h2 = clusters.find((c) => c.symbol === Symbol.H2);
  const l1 = clusters.find((c) => c.symbol === Symbol.L1);
  assert.strictEqual(h2?.size, 3);
  assert.strictEqual(l1?.size, 2);
});

test("Wild: two wilds both want same component -> both assign", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [0, 1, Symbol.L1],
    [1, 0, Symbol.WILD],
    [1, 1, Symbol.WILD],
  ]);
  const config = makeConfig({ minClusterSize: 1 });
  const clusters = firstCascadeClusters(config, grid);
  const l1 = clusters.find((c) => c.symbol === Symbol.L1);
  assert.strictEqual(l1?.size, 4);
});

test("Wild: touches no base component -> unassigned", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [0, 1, Symbol.L1],
    [7, 7, Symbol.WILD],
  ]);
  const config = makeConfig({ minClusterSize: 1 });
  const clusters = firstCascadeClusters(config, grid);
  const l1 = clusters.find((c) => c.symbol === Symbol.L1);
  assert.strictEqual(l1?.size, 2);
});

test("Multiplier: cluster hits double on cells", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  const mult = new MultiplierGrid(8, 8, 1);
  const clusterCells = [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
  ];
  applyWinsAndRemove(
    grid,
    mult,
    [{ symbol: Symbol.L1, cells: clusterCells, size: 2 }],
    2,
  );
  const snap = mult.snapshot();
  assert.strictEqual(snap[0]?.[0], 2);
  assert.strictEqual(snap[0]?.[1], 2);
});

test("Multiplier: stays on board positions after drop", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  const mult = new MultiplierGrid(8, 8, 1);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [2, 0, Symbol.L1],
  ]);
  mult.multiplyCell(0, 0, 2);
  dropDown(grid);
  assert.strictEqual(grid.get(7, 0), Symbol.L1);
  assert.strictEqual(grid.get(6, 0), Symbol.L1);
  assert.strictEqual(grid.get(0, 0), Symbol.EMPTY);
  const snap = mult.snapshot();
  assert.strictEqual(snap[0]?.[0], 2);
});

test("Multiplier: win uses updated avg multiplier", () => {
  const mult = new MultiplierGrid(8, 8, 1);
  mult.multiplyCell(0, 0, 2);
  const cluster = {
    symbol: Symbol.L1,
    cells: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
    ],
    size: 2,
  };
  const payTable: PayTable = () => 10;
  const win = computeClusterWin(cluster, mult, payTable);
  assert.strictEqual(win, 20);
});

test("Multiplier: hit accumulation doubles per hit", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  const mult = new MultiplierGrid(8, 8, 1);
  const cluster = {
    symbol: Symbol.L1,
    cells: [
      { r: 0, c: 0 },
      { r: 0, c: 1 },
      { r: 0, c: 2 },
    ],
    size: 3,
  };
  const sum0 = mult.sumOver(cluster.cells);
  assert.strictEqual(sum0, 3);
  applyWinsAndRemove(grid, mult, [cluster], 2);
  const sum1 = mult.sumOver(cluster.cells);
  assert.strictEqual(sum1, 6);
  applyWinsAndRemove(grid, mult, [cluster], 2);
  const sum2 = mult.sumOver(cluster.cells);
  assert.strictEqual(sum2, 12);
});

test("Scatter: 2 -> 3 after refill triggers bonus", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [0, 1, Symbol.L1],
    [1, 0, Symbol.SCATTER],
    [1, 1, Symbol.SCATTER],
  ]);
  const config = makeConfig({
    minClusterSize: 2,
    weights: buildWeights([[Symbol.SCATTER, 1]]),
  });
  const multGrid = new MultiplierGrid(8, 8, 1);
  const rng = DeterministicRng.seeded(1);
  const { outcome } = runCascadesOnGrid(
    grid,
    multGrid,
    Mode.BASE,
    rng,
    config,
  );
  assert.strictEqual(outcome.bonusTriggered, true);
});

test("Scatter: bonus triggered does not skip cascades", () => {
  const grid = new Grid(8, 8, Symbol.EMPTY);
  setCells(grid, [
    [0, 0, Symbol.L1],
    [0, 1, Symbol.L1],
    [1, 0, Symbol.SCATTER],
    [1, 1, Symbol.SCATTER],
    [1, 2, Symbol.SCATTER],
  ]);
  const config = makeConfig({
    minClusterSize: 2,
    weights: buildWeights([[Symbol.SCATTER, 1]]),
  });
  const multGrid = new MultiplierGrid(8, 8, 1);
  const rng = DeterministicRng.seeded(1);
  const { outcome } = runCascadesOnGrid(
    grid,
    multGrid,
    Mode.BASE,
    rng,
    config,
  );
  assert.strictEqual(outcome.bonusTriggered, true);
  assert.strictEqual(outcome.numCascadeSteps, 1);
});

test("Cap: payout clamps to 15000 and spin ends", () => {
  const payTable: PayTable = () => 20000;
  const config = makeConfig({
    minClusterSize: 1,
    payTable,
    weights: buildWeights([[Symbol.L1, 1]]),
  });
  const rng = DeterministicRng.seeded(1);
  const { result } = spin(1, rng, config);
  assert.strictEqual(result.totalWinX, 15000);
  assert.strictEqual(result.capHit, true);
  assert.strictEqual(result.bonusSpinsPlayed, 0);
});

run();
