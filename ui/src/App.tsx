import { useMemo, useState } from "react";
import { Mode, Symbol, spin } from "@engine/index";
import type { GameConfig, WeightedCdfEntry, Weights } from "@math/index";
import type { PayTable } from "@math/payTable";
import { DeterministicRng } from "@rng/index";

const payTable: PayTable = (symbol: Symbol, size: number) => {
  const scale = 0.22;
  if (symbol === Symbol.H2) return size * 100.0 * scale;
  if (symbol === Symbol.H1) return size * 80.0 * scale;
  if (symbol === Symbol.M4) return size * 2.6 * scale;
  if (symbol === Symbol.M3) return size * 1.6 * scale;
  if (symbol === Symbol.M2) return size * 1.1 * scale;
  if (symbol === Symbol.M1) return size * 0.9 * scale;
  return size * 0.4 * scale;
};

const baseEntries: Array<[Symbol, number]> = [
  [Symbol.L1, 32],
  [Symbol.L2, 32],
  [Symbol.L3, 32],
  [Symbol.L4, 32],
  [Symbol.M1, 16],
  [Symbol.M2, 16],
  [Symbol.M3, 16],
  [Symbol.M4, 16],
  [Symbol.H1, 4],
  [Symbol.H2, 4],
  [Symbol.WILD, 10],
  [Symbol.SCATTER, 1],
];

const bonusEntries: Array<[Symbol, number]> = [
  [Symbol.L1, 28],
  [Symbol.L2, 28],
  [Symbol.L3, 28],
  [Symbol.L4, 28],
  [Symbol.M1, 18],
  [Symbol.M2, 18],
  [Symbol.M3, 18],
  [Symbol.M4, 18],
  [Symbol.H1, 5],
  [Symbol.H2, 5],
  [Symbol.WILD, 8],
  [Symbol.SCATTER, 1],
];

function buildWeights(
  base: Array<[Symbol, number]>,
  bonus: Array<[Symbol, number]>,
): Weights {
  const baseMap = new Map<Symbol, number>(base);
  const bonusMap = new Map<Symbol, number>(bonus);
  const cdfBase: WeightedCdfEntry[] = [];
  const cdfBonus: WeightedCdfEntry[] = [];
  let cum = 0;
  for (const [symbol, weight] of base) {
    cum += weight;
    cdfBase.push({ symbol, cumWeight: cum });
  }
  const totalBase = cum;
  cum = 0;
  for (const [symbol, weight] of bonus) {
    cum += weight;
    cdfBonus.push({ symbol, cumWeight: cum });
  }
  const totalBonus = cum;
  return { base: baseMap, bonus: bonusMap, cdfBase, cdfBonus, totalBase, totalBonus };
}

const config: GameConfig = {
  rows: 8,
  cols: 8,
  minClusterSize: 4,
  adjacency: "N4",
  maxWinX: 15000,
  payTable,
  bonus: {
    triggerScatters: 4,
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
  weights: buildWeights(baseEntries, bonusEntries),
  mode: Mode.BASE,
};

const symbolClass = (sym: Symbol) => {
  switch (sym) {
    case Symbol.L1:
      return "cell sym-l1";
    case Symbol.L2:
      return "cell sym-l2";
    case Symbol.L3:
      return "cell sym-l3";
    case Symbol.L4:
      return "cell sym-l4";
    case Symbol.M1:
      return "cell sym-m1";
    case Symbol.M2:
      return "cell sym-m2";
    case Symbol.M3:
      return "cell sym-m3";
    case Symbol.M4:
      return "cell sym-m4";
    case Symbol.H1:
      return "cell sym-h1";
    case Symbol.H2:
      return "cell sym-h2";
    case Symbol.WILD:
      return "cell sym-wild";
    case Symbol.SCATTER:
      return "cell sym-scatter";
    default:
      return "cell sym-empty";
  }
};

function seedFromTime(): number {
  return Math.floor(Date.now() % 0xffffffff);
}

export default function App() {
  const [seed, setSeed] = useState(() => seedFromTime());
  const rng = useMemo(() => DeterministicRng.seeded(seed), [seed]);
  const [outcome, setOutcome] = useState(() => spin(1, rng, config));
  const [stepIndex, setStepIndex] = useState(0);

  const transcript = outcome.transcript;
  const grid = transcript.initialGrid;
  const step = transcript.cascades[stepIndex];

  return (
    <div className="app">
      <div className="panel">
        <div className="header">
          <div className="title">Slot Engine</div>
          <div className="subtitle">React replay of spin transcript</div>
        </div>
        <GridView grid={grid} />
      </div>
      <div className="panel controls">
        <button
          onClick={() => {
            const nextSeed = seedFromTime();
            setSeed(nextSeed);
            const nextRng = DeterministicRng.seeded(nextSeed);
            setOutcome(spin(1, nextRng, config));
            setStepIndex(0);
          }}
        >
          Spin
        </button>
        <div className="cascade">
          <div className="subtitle">Cascades</div>
          <div className="cascade-nav">
            <button
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Prev
            </button>
            <div className="cascade-count">
              {transcript.cascades.length === 0
                ? "0 / 0"
                : `${stepIndex + 1} / ${transcript.cascades.length}`}
            </div>
            <button
              disabled={stepIndex >= transcript.cascades.length - 1}
              onClick={() =>
                setStepIndex((i) =>
                  Math.min(transcript.cascades.length - 1, i + 1),
                )
              }
            >
              Next
            </button>
          </div>
          {step ? (
            <div className="cascade-grid">
              <GridView
                grid={step.gridAfter}
                highlights={new Set(step.removed.map((c) => `${c.r},${c.c}`))}
              />
            </div>
          ) : (
            <div className="empty-state">No wins this spin</div>
          )}
        </div>
        <div className="stats">
          <div className="stat">
            Total Win<span>{outcome.result.totalWinX.toFixed(2)}x</span>
          </div>
          <div className="stat">
            Base Win<span>{outcome.result.baseWinX.toFixed(2)}x</span>
          </div>
          <div className="stat">
            Bonus Win<span>{outcome.result.bonusWinX.toFixed(2)}x</span>
          </div>
          <div className="stat">
            Bonus Spins<span>{outcome.result.bonusSpinsPlayed}</span>
          </div>
          <div className="stat">
            Cap Hit<span>{outcome.result.capHit ? "yes" : "no"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GridView({
  grid,
  highlights,
}: {
  grid: Symbol[][];
  highlights?: Set<string>;
}) {
  return (
    <div className="grid">
      {grid.map((row, rIdx) =>
        row.map((cell, cIdx) => {
          const key = `${rIdx}-${cIdx}`;
          const marked = highlights?.has(`${rIdx},${cIdx}`);
          return (
            <div
              key={key}
              className={`${symbolClass(cell)}${marked ? " marked" : ""}`}
            >
              {cell}
            </div>
          );
        }),
      )}
    </div>
  );
}
