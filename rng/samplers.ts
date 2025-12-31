import { WeightedSampler } from "./weightedSampler";
import { Weights } from "../math/gameConfig";

export type Samplers = {
  baseSampler: WeightedSampler;
  bonusSampler: WeightedSampler;
};

export function buildSamplers(weights: Weights): Samplers {
  const baseSampler = new WeightedSampler(weights);
  const bonusSampler = new WeightedSampler(weights);
  return { baseSampler, bonusSampler };
}
