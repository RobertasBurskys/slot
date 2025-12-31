import { Grid } from "../engine/grid";
import { MultiplierGrid } from "../engine/multiplierGrid";
import { Mode, SpinResult, Symbol, SpinTranscript } from "../engine/types";
import { countScatters, fillGrid, runCascades } from "../engine/engine";
import { GameConfig } from "../math/gameConfig";
import { Rng } from "../rng/rng";
import { WeightedSampler } from "../rng/weightedSampler";
import { Worker } from "worker_threads";
import * as path from "path";
import * as fs from "fs";

export type SimOptions = {
  spins: number;
  bet: number;
  threads?: number;
  baseSeed?: number;
  storePayoutsUpTo?: number;
  histogramEdges?: number[];
  workerConfigModule?: string;
};

export type Quantiles = {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
};

export type TailRates = {
  gte100x: number;
  gte1000x: number;
  gte5000x: number;
  capHitRate: number;
};

export type SimReport = {
  spins: number;
  meanWinX: number;
  rtp: number;
  variance: number;
  stddev: number;
  stdError: number;
  ci95: { low: number; high: number };
  hitRate: number;
  bonusFrequency: number;
  avgCascades: number;
  avgBonusLength: number;
  quantiles: Quantiles;
  tailRates: TailRates;
  histogram?: { edges: number[]; counts: number[] };
};

export type SimStats = {
  count: number;
  sum: number;
  sumSq: number;
  hitCount: number;
  bonusCount: number;
  capHitCount: number;
  tail100: number;
  tail1000: number;
  tail5000: number;
  totalCascades: number;
  totalBonusSpins: number;
  payouts?: number[];
  histogram: { edges: number[]; counts: number[] };
};

export async function runSimulation(
  config: GameConfig,
  rngFactory: (seed: number) => Rng,
  options: SimOptions,
): Promise<SimReport> {
  const threads = Math.max(1, options.threads ?? 1);
  if (threads === 1) {
    const stats = runSimulationStats(
      config,
      rngFactory,
      options,
    );
    return finalizeReport(stats, options.bet);
  }
  if (!options.workerConfigModule) {
    throw new Error("workerConfigModule is required for multi-threaded runs");
  }
  const stats = await runSimulationMultiThread(
    options,
  );
  return finalizeReport(stats, options.bet);
}

export function runSimulationStats(
  config: GameConfig,
  rngFactory: (seed: number) => Rng,
  options: SimOptions,
): SimStats {
  const stats = createStats(options);
  const rng = rngFactory(options.baseSeed ?? 1);
  for (let i = 0; i < options.spins; i++) {
    const spinStats = simulateSpin(options.bet, rng, config);
    recordSpin(stats, spinStats.result, spinStats.numCascades);
  }
  return stats;
}

async function runSimulationMultiThread(
  options: SimOptions,
): Promise<SimStats> {
  const threads = Math.max(1, options.threads ?? 1);
  const spinsPer = Math.floor(options.spins / threads);
  const remainder = options.spins % threads;
  const workerPath = resolveWorkerPath();
  const tasks: Promise<SimStats>[] = [];
  for (let i = 0; i < threads; i++) {
    const spins = spinsPer + (i < remainder ? 1 : 0);
    const seed = (options.baseSeed ?? 1) + i * 101;
    const worker = new Worker(workerPath, {
      workerData: {
        spins,
        bet: options.bet,
        seed,
        storePayoutsUpTo: options.storePayoutsUpTo,
        histogramEdges: options.histogramEdges,
        configModule: options.workerConfigModule,
      },
      execArgv: workerPath.endsWith(".ts") ? process.execArgv : undefined,
    });
    tasks.push(
      new Promise((resolve, reject) => {
        worker.on("message", (msg) => resolve(msg as SimStats));
        worker.on("error", reject);
        worker.on("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`worker exit ${code}`));
          }
        });
      }),
    );
  }
  const partials = await Promise.all(tasks);
  return mergeStats(partials);
}

type SpinSim = {
  result: SpinResult;
  numCascades: number;
};

function simulateSpin(
  bet: number,
  rng: Rng,
  config: GameConfig,
): SpinSim {
  void bet;
  const grid = new Grid(config.rows, config.cols, Symbol.EMPTY);
  const multGrid = new MultiplierGrid(
    config.rows,
    config.cols,
    config.multiplier.initialCellMultiplier,
  );
  const sampler = new WeightedSampler(config.weights);
  const baseSampler = { sampleSymbol: (r: Rng) => sampler.sampleSymbol(r, false) };
  const bonusSampler = { sampleSymbol: (r: Rng) => sampler.sampleSymbol(r, true) };

  fillGrid(grid, baseSampler, rng);
  const baseTranscript: SpinTranscript = { initialGrid: [], cascades: [] };
  let bonusTriggered = countScatters(grid) >= config.bonus.triggerScatters;
  const baseOutcome = runCascades(
    Mode.BASE,
    grid,
    multGrid,
    rng,
    config,
    baseTranscript,
  );
  bonusTriggered = bonusTriggered || baseOutcome.bonusTriggered;

  let baseWinX = baseOutcome.winX;
  let bonusWinX = 0;
  let capHit = baseOutcome.capHit;
  let totalWinX = baseWinX;
  let totalCascades = baseOutcome.numCascadeSteps;
  let bonusSpinsPlayed = 0;

  if (!capHit && bonusTriggered) {
    let freeSpins = config.bonus.bonusSpins;
    let extraAwarded = 0;
    const maxExtra = config.bonus.maxBonusExtraSpins ?? 0;
    for (let i = 0; i < freeSpins; i++) {
      clearGrid(grid);
      fillGrid(grid, bonusSampler, rng);
      const bonusTranscript: SpinTranscript = { initialGrid: [], cascades: [] };
      const outcome = runCascades(
        Mode.BONUS,
        grid,
        multGrid,
        rng,
        config,
        bonusTranscript,
      );
      bonusSpinsPlayed += 1;
      totalCascades += outcome.numCascadeSteps;
      if (baseWinX + bonusWinX + outcome.winX >= config.maxWinX) {
        bonusWinX = config.maxWinX - baseWinX;
        totalWinX = config.maxWinX;
        capHit = true;
        break;
      }
      bonusWinX += outcome.winX;
      totalWinX = baseWinX + bonusWinX;

      if (countScatters(grid) >= config.bonus.triggerScatters) {
        if (extraAwarded < maxExtra) {
          const remaining = maxExtra - extraAwarded;
          const add = Math.min(config.bonus.bonusRetriggerSpins, remaining);
          freeSpins += add;
          extraAwarded += add;
        }
      }
      if (outcome.capHit) {
        capHit = true;
        totalWinX = Math.min(totalWinX, config.maxWinX);
        break;
      }
    }
  }

  multGrid.reset();
  return {
    numCascades: totalCascades,
    result: {
      totalWinX,
      baseWinX,
      bonusWinX,
      bonusTriggered,
      bonusSpinsPlayed,
      capHit,
    },
  };
}

function clearGrid(grid: Grid): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      grid.set(r, c, Symbol.EMPTY);
    }
  }
}

function createStats(options: SimOptions): SimStats {
  const edges = options.histogramEdges ?? [
    0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, Infinity,
  ];
  return {
    count: 0,
    sum: 0,
    sumSq: 0,
    hitCount: 0,
    bonusCount: 0,
    capHitCount: 0,
    tail100: 0,
    tail1000: 0,
    tail5000: 0,
    totalCascades: 0,
    totalBonusSpins: 0,
    payouts: options.spins <= (options.storePayoutsUpTo ?? 1_000_000)
      ? []
      : undefined,
    histogram: { edges, counts: Array.from({ length: edges.length - 1 }, () => 0) },
  };
}

function recordSpin(
  stats: SimStats,
  result: SpinResult,
  numCascades: number,
): void {
  stats.count += 1;
  stats.sum += result.totalWinX;
  stats.sumSq += result.totalWinX * result.totalWinX;
  stats.totalCascades += numCascades;
  stats.totalBonusSpins += result.bonusSpinsPlayed;
  if (result.totalWinX > 0) {
    stats.hitCount += 1;
  }
  if (result.bonusTriggered) {
    stats.bonusCount += 1;
  }
  if (result.capHit) {
    stats.capHitCount += 1;
  }
  if (result.totalWinX >= 100) {
    stats.tail100 += 1;
  }
  if (result.totalWinX >= 1000) {
    stats.tail1000 += 1;
  }
  if (result.totalWinX >= 5000) {
    stats.tail5000 += 1;
  }
  if (stats.payouts) {
    stats.payouts.push(result.totalWinX);
  }
  recordHistogram(stats.histogram, result.totalWinX);
}

function recordHistogram(
  histogram: { edges: number[]; counts: number[] },
  value: number,
): void {
  const edges = histogram.edges;
  for (let i = 0; i < edges.length - 1; i++) {
    if (value >= edges[i] && value < edges[i + 1]) {
      histogram.counts[i] += 1;
      return;
    }
  }
  histogram.counts[histogram.counts.length - 1] += 1;
}

function finalizeReport(stats: SimStats, bet: number): SimReport {
  const n = stats.count;
  const mean = stats.sum / n;
  const variance = n > 1
    ? (stats.sumSq - (stats.sum * stats.sum) / n) / (n - 1)
    : 0;
  const stddev = Math.sqrt(Math.max(0, variance));
  const stdError = n > 0 ? stddev / Math.sqrt(n) : 0;
  const ci95 = {
    low: mean - 1.96 * stdError,
    high: mean + 1.96 * stdError,
  };
  const quantiles = stats.payouts
    ? computeQuantilesExact(stats.payouts)
    : computeQuantilesFromHistogram(stats.histogram);
  return {
    spins: n,
    meanWinX: mean,
    rtp: bet > 0 ? mean : 0,
    variance,
    stddev,
    stdError,
    ci95,
    hitRate: n > 0 ? stats.hitCount / n : 0,
    bonusFrequency: n > 0 ? stats.bonusCount / n : 0,
    avgCascades: n > 0 ? stats.totalCascades / n : 0,
    avgBonusLength: stats.bonusCount > 0
      ? stats.totalBonusSpins / stats.bonusCount
      : 0,
    quantiles,
    tailRates: {
      gte100x: n > 0 ? stats.tail100 / n : 0,
      gte1000x: n > 0 ? stats.tail1000 / n : 0,
      gte5000x: n > 0 ? stats.tail5000 / n : 0,
      capHitRate: n > 0 ? stats.capHitCount / n : 0,
    },
    histogram: stats.payouts ? undefined : stats.histogram,
  };
}

function computeQuantilesExact(payouts: number[]): Quantiles {
  if (payouts.length === 0) {
    return { p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const arr = payouts.slice().sort((a, b) => a - b);
  return {
    p50: percentile(arr, 0.5),
    p90: percentile(arr, 0.9),
    p95: percentile(arr, 0.95),
    p99: percentile(arr, 0.99),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) {
    return sorted[lo] as number;
  }
  const w = idx - lo;
  return (sorted[lo] as number) * (1 - w) + (sorted[hi] as number) * w;
}

function computeQuantilesFromHistogram(
  histogram: { edges: number[]; counts: number[] },
): Quantiles {
  const total = histogram.counts.reduce((a, b) => a + b, 0);
  return {
    p50: quantileFromHistogram(histogram, total, 0.5),
    p90: quantileFromHistogram(histogram, total, 0.9),
    p95: quantileFromHistogram(histogram, total, 0.95),
    p99: quantileFromHistogram(histogram, total, 0.99),
  };
}

function quantileFromHistogram(
  histogram: { edges: number[]; counts: number[] },
  total: number,
  q: number,
): number {
  if (total === 0) {
    return 0;
  }
  const target = total * q;
  let cum = 0;
  for (let i = 0; i < histogram.counts.length; i++) {
    const count = histogram.counts[i] as number;
    if (cum + count >= target) {
      const lo = histogram.edges[i] as number;
      const hi = histogram.edges[i + 1] as number;
      if (!Number.isFinite(hi)) {
        return lo;
      }
      const mid = (lo + hi) / 2;
      return mid;
    }
    cum += count;
  }
  return histogram.edges[histogram.edges.length - 2] as number;
}

function mergeStats(partials: SimStats[]): SimStats {
  if (partials.length === 0) {
    return createStats({ spins: 0, bet: 0 });
  }
  const base = createStats({ spins: 0, bet: 0 });
  base.histogram.edges = partials[0]?.histogram.edges ?? base.histogram.edges;
  base.histogram.counts = Array.from(
    { length: base.histogram.edges.length - 1 },
    () => 0,
  );
  for (const p of partials) {
    base.count += p.count;
    base.sum += p.sum;
    base.sumSq += p.sumSq;
    base.hitCount += p.hitCount;
    base.bonusCount += p.bonusCount;
    base.capHitCount += p.capHitCount;
    base.tail100 += p.tail100;
    base.tail1000 += p.tail1000;
    base.tail5000 += p.tail5000;
    base.totalCascades += p.totalCascades;
    base.totalBonusSpins += p.totalBonusSpins;
    for (let i = 0; i < base.histogram.counts.length; i++) {
      base.histogram.counts[i] += p.histogram.counts[i] ?? 0;
    }
  }
  return base;
}

function resolveWorkerPath(): string {
  const jsPath = path.join(__dirname, "simWorker.js");
  if (fs.existsSync(jsPath)) {
    return jsPath;
  }
  return path.join(__dirname, "simWorker.ts");
}
