import { useEffect, useMemo, useRef, useState } from "react";
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

const iconMap: Record<Symbol, string> = {
  [Symbol.L1]: new URL("./symbols/L1.svg", import.meta.url).href,
  [Symbol.L2]: new URL("./symbols/L2.svg", import.meta.url).href,
  [Symbol.L3]: new URL("./symbols/L3.svg", import.meta.url).href,
  [Symbol.L4]: new URL("./symbols/L4.svg", import.meta.url).href,
  [Symbol.M1]: new URL("./symbols/M1.svg", import.meta.url).href,
  [Symbol.M2]: new URL("./symbols/M2.svg", import.meta.url).href,
  [Symbol.M3]: new URL("./symbols/M3.svg", import.meta.url).href,
  [Symbol.M4]: new URL("./symbols/M4.svg", import.meta.url).href,
  [Symbol.H1]: new URL("./symbols/H1.svg", import.meta.url).href,
  [Symbol.H2]: new URL("./symbols/H2.svg", import.meta.url).href,
  [Symbol.WILD]: new URL("./symbols/WILD.svg", import.meta.url).href,
  [Symbol.SCATTER]: new URL("./symbols/SCATTER.svg", import.meta.url).href,
  [Symbol.EMPTY]: new URL("./symbols/EMPTY.svg", import.meta.url).href,
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
  const [displayGrid, setDisplayGrid] = useState(() => outcome.transcript.initialGrid);
  const [highlightSet, setHighlightSet] = useState<Set<string> | undefined>(undefined);
  const [displayMult, setDisplayMult] = useState(() =>
    createMultiplierGrid(config.rows, config.cols, 1),
  );
  const [isSpinning, setIsSpinning] = useState(false);
  const timersRef = useRef<number[]>([]);
  const intervalRef = useRef<number | undefined>(undefined);

  const transcript = outcome.transcript;
  const grid = transcript.initialGrid;
  const step = transcript.cascades[stepIndex];
  const payoutFormula = step ? buildPayoutFormula(step) : null;

  useEffect(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    setDisplayGrid(transcript.initialGrid);
    setHighlightSet(undefined);
    setDisplayMult(createMultiplierGrid(config.rows, config.cols, 1));
    if (transcript.cascades.length === 0) {
      setIsSpinning(false);
      return;
    }
    setIsSpinning(true);
    intervalRef.current = window.setInterval(() => {
      setDisplayGrid(randomGrid(config.rows, config.cols));
      setDisplayMult(createMultiplierGrid(config.rows, config.cols, 1));
    }, 80);
    const preSpinDuration = 520;
    let delay = preSpinDuration;
    transcript.cascades.forEach((cascade) => {
      const mark = new Set(cascade.removed.map((c) => `${c.r},${c.c}`));
      timersRef.current.push(
        window.setTimeout(() => {
          setHighlightSet(mark);
        }, delay),
      );
      delay += 250;
      timersRef.current.push(
        window.setTimeout(() => {
          setDisplayGrid(cascade.gridAfter);
          if (cascade.multiplierGrid) {
            setDisplayMult(cascade.multiplierGrid);
          }
          setHighlightSet(undefined);
        }, delay),
      );
      delay += 250;
    });
    timersRef.current.push(
      window.setTimeout(() => {
        setIsSpinning(false);
      }, delay),
    );
    timersRef.current.push(
      window.setTimeout(() => {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = undefined;
        }
        setDisplayGrid(transcript.initialGrid);
      }, preSpinDuration),
    );
  }, [transcript]);

  return (
    <div className="scene">
      <div className="marquee">
        <div className="brand">Neon Cluster</div>
        <div className="subtitle">8x8 Cascading Slot</div>
      </div>
      <div className="machine">
        <div className="machine-frame">
          <div className="meter">
            <div className="meter-block">
              <div className="meter-label">Total Win</div>
              <div className="meter-value">{outcome.result.totalWinX.toFixed(2)}x</div>
            </div>
            <div className="meter-block">
              <div className="meter-label">Base</div>
              <div className="meter-value">{outcome.result.baseWinX.toFixed(2)}x</div>
            </div>
            <div className="meter-block">
              <div className="meter-label">Bonus</div>
              <div className="meter-value">{outcome.result.bonusWinX.toFixed(2)}x</div>
            </div>
            <div className="meter-block">
              <div className="meter-label">Bonus Spins</div>
              <div className="meter-value">{outcome.result.bonusSpinsPlayed}</div>
            </div>
          </div>
          <div className={`reel-window${isSpinning ? " spinning" : ""}`}>
            <GridView
              grid={displayGrid}
              highlights={highlightSet}
              multGrid={displayMult}
            />
            <div className={`payout-ribbon${payoutFormula ? " show" : ""}`}>
              {payoutFormula ? payoutFormula : "No win this spin"}
            </div>
          </div>
          <div className="control-bar">
            <button
              className="spin-button"
              disabled={isSpinning}
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
            <div className="meter-mini">
              <div>Hit Rate Target: 20-40%</div>
              <div>Bonus Freq Target: ~0.4%</div>
            </div>
          </div>
        </div>
        <div className="side-panel">
          <div className="panel-title">Cascade Replay</div>
          <div className="cascade">
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
              Cap Hit<span>{outcome.result.capHit ? "yes" : "no"}</span>
            </div>
            <div className="stat">
              Seed<span>{seed}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GridView({
  grid,
  highlights,
  multGrid,
}: {
  grid: Symbol[][];
  highlights?: Set<string>;
  multGrid?: number[][];
}) {
  return (
    <div className="grid">
      {grid.map((row, rIdx) =>
        row.map((cell, cIdx) => {
          const key = `${rIdx}-${cIdx}`;
          const marked = highlights?.has(`${rIdx},${cIdx}`);
          const mult = multGrid?.[rIdx]?.[cIdx] ?? 1;
          return (
            <div
              key={key}
              className={`${symbolClass(cell)}${marked ? " marked" : ""}`}
            >
              <div className="cell-content">
                <img className="cell-icon" src={iconMap[cell]} alt={cell} />
                <div className="cell-label">{cell}</div>
                <div className="cell-mult">x{mult}</div>
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}

function createMultiplierGrid(rows: number, cols: number, value: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => value),
  );
}

function randomGrid(rows: number, cols: number): Symbol[][] {
  const symbols = [
    Symbol.L1,
    Symbol.L2,
    Symbol.L3,
    Symbol.L4,
    Symbol.M1,
    Symbol.M2,
    Symbol.M3,
    Symbol.M4,
    Symbol.H1,
    Symbol.H2,
    Symbol.WILD,
    Symbol.SCATTER,
  ];
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => symbols[Math.floor(Math.random() * symbols.length)]),
  );
}

function buildPayoutFormula(step: { clusters: { symbol: Symbol; size: number; cells: { r: number; c: number }[] }[]; multiplierGrid?: number[][] }): string | null {
  const cluster = step.clusters[0];
  if (!cluster) {
    return null;
  }
  const basePay = payTable(cluster.symbol, cluster.size);
  const mults = step.multiplierGrid
    ? cluster.cells.map((c) => step.multiplierGrid?.[c.r]?.[c.c] ?? 1)
    : [];
  const shown = mults.slice(0, 6).map((m) => `${m}`);
  const suffix = mults.length > 6 ? ` +${mults.length - 6}` : "";
  const chain = shown.length > 0 ? ` x ${shown.join(" x ")}${suffix}` : "";
  return `1 x ${basePay.toFixed(2)}${chain}`;
}
