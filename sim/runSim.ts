import { runSimulation, SimOptions } from "./simRunner";
import { GameConfig } from "../math/gameConfig";
import { Rng } from "../rng/rng";
import path from "path";

type WorkerModule = {
  createConfig: () => GameConfig;
  createRng: (seed: number) => Rng;
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

function parseEdges(value: string | undefined): number[] | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const configModule = args.config;
  if (!configModule) {
    console.error("Usage: tsx sim/runSim.ts --config ./sim/workerConfig.template.ts --spins 1000000 --bet 1");
    process.exitCode = 1;
    return;
  }
  const configPath = path.resolve(process.cwd(), configModule);
  const mod = require(configPath) as WorkerModule;
  const config = mod.createConfig();
  const rngFactory = (seed: number) => mod.createRng(seed);

  const options: SimOptions = {
    spins: parseNumber(args.spins, 100000),
    bet: parseNumber(args.bet, 1),
    threads: parseNumber(args.threads, 1),
    baseSeed: parseNumber(args.seed, 1),
    storePayoutsUpTo: parseNumber(args.storePayoutsUpTo, 1_000_000),
    histogramEdges: parseEdges(args.histogramEdges),
    workerConfigModule: configPath,
  };

  const report = await runSimulation(config, rngFactory, options);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
