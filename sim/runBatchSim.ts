import { runSimulation, SimOptions } from "./simRunner";
import { GameConfig } from "../math/gameConfig";
import { Rng } from "../rng/rng";
import path from "path";

type WorkerModule = {
  createConfig: () => GameConfig;
  createRng: (seed: number) => Rng;
};

type BatchResult = {
  seed: number;
  meanWinX: number;
  rtp: number;
};

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const val = argv[i + 1];
    if (val && !val.startsWith("--")) {
      args[key] = val;
      i += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const configModule = args.config;
  if (!configModule) {
    console.error("Usage: tsx sim/runBatchSim.ts --config ./sim/workerConfig.template.ts --spins 1000000 --batches 10 --bet 1");
    process.exitCode = 1;
    return;
  }
  const configPath = path.resolve(process.cwd(), configModule);
  const mod = require(configPath) as WorkerModule;
  const config = mod.createConfig();
  const rngFactory = (seed: number) => mod.createRng(seed);

  const batches = parseNumber(args.batches, 5);
  const spins = parseNumber(args.spins, 1_000_000);
  const bet = parseNumber(args.bet, 1);
  const threads = parseNumber(args.threads, 1);
  const baseSeed = parseNumber(args.seed, 1);

  const results: BatchResult[] = [];
  for (let i = 0; i < batches; i++) {
    const seed = baseSeed + i * 101;
    const options: SimOptions = {
      spins,
      bet,
      threads,
      baseSeed: seed,
      workerConfigModule: configPath,
    };
    const report = await runSimulation(config, rngFactory, options);
    results.push({
      seed,
      meanWinX: report.meanWinX,
      rtp: report.rtp,
    });
    console.log(`batch ${i + 1}/${batches} seed=${seed} rtp=${report.rtp.toFixed(6)}`);
  }

  const avg = results.reduce((a, b) => a + b.rtp, 0) / results.length;
  const variance = results.length > 1
    ? results.reduce((a, b) => a + (b.rtp - avg) ** 2, 0) / (results.length - 1)
    : 0;
  const stddev = Math.sqrt(variance);
  const se = results.length > 0 ? stddev / Math.sqrt(results.length) : 0;
  const ci95 = {
    low: avg - 1.96 * se,
    high: avg + 1.96 * se,
  };

  console.log(JSON.stringify({
    batches: results.length,
    spinsPerBatch: spins,
    avgRtp: avg,
    stddevAcrossBatches: stddev,
    stdErrorAcrossBatches: se,
    ci95,
    perBatch: results,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
