import { parentPort, workerData } from "worker_threads";
import { GameConfig } from "../math/gameConfig";
import { runSimulationStats } from "./simRunner";
import { Rng } from "../rng/rng";

type WorkerModule = {
  createConfig: () => GameConfig;
  createRng: (seed: number) => Rng;
};

type WorkerData = {
  spins: number;
  bet: number;
  seed: number;
  storePayoutsUpTo?: number;
  histogramEdges?: number[];
  configModule: string;
};

const data = workerData as WorkerData;
const mod = require(data.configModule) as WorkerModule;
const config = mod.createConfig();
const rngFactory = (seed: number) => mod.createRng(seed);

const stats = runSimulationStats(config, rngFactory, {
  spins: data.spins,
  bet: data.bet,
  threads: 1,
  baseSeed: data.seed,
  storePayoutsUpTo: data.storePayoutsUpTo,
  histogramEdges: data.histogramEdges,
});

parentPort?.postMessage(stats);
