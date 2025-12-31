import { Grid } from "./grid";
import { MultiplierGrid } from "./multiplierGrid";
import { Mode, SpinResult, SpinTranscript, Symbol } from "./types";
import { GameConfig } from "../math/gameConfig";
import { Rng } from "../rng/rng";
import { WeightedSampler } from "../rng/weightedSampler";
import { fillGrid, runCascades, countScatters } from "./engine";

export type SpinOutcome = {
  result: SpinResult;
  transcript: SpinTranscript;
};

export function spin(
  bet: number,
  rng: Rng,
  config: GameConfig,
): SpinOutcome {
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
  const transcript: SpinTranscript = {
    initialGrid: grid.snapshot(),
    cascades: [],
  };

  let bonusTriggered = countScatters(grid) >= config.bonus.triggerScatters;
  const baseOutcome = runCascades(
    Mode.BASE,
    grid,
    multGrid,
    rng,
    config,
    transcript,
  );
  bonusTriggered = bonusTriggered || baseOutcome.bonusTriggered;

  const baseWinX = baseOutcome.winX;
  let bonusWinX = 0;
  let capHit = baseOutcome.capHit;
  let totalWinX = baseWinX;

  if (!capHit && bonusTriggered) {
    transcript.bonus = { spins: [] };
    let freeSpins = config.bonus.bonusSpins;
    let extraAwarded = 0;
    const maxExtra = config.bonus.maxBonusExtraSpins ?? 0;
    for (let i = 0; i < freeSpins; i++) {
      clearGrid(grid);
      fillGrid(grid, bonusSampler, rng);
      const spinTranscript: SpinTranscript = {
        initialGrid: grid.snapshot(),
        cascades: [],
      };
      const outcome = runCascades(
        Mode.BONUS,
        grid,
        multGrid,
        rng,
        config,
        spinTranscript,
      );
      transcript.bonus.spins.push(spinTranscript);
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
    result: {
      totalWinX,
      baseWinX,
      bonusWinX,
      bonusTriggered,
      bonusSpinsPlayed: bonusTriggered ? (transcript.bonus?.spins.length ?? 0) : 0,
      capHit,
    },
    transcript,
  };
}

function clearGrid(grid: Grid): void {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      grid.set(r, c, Symbol.EMPTY);
    }
  }
}
