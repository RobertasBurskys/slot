# slot
making a slot.

## Data model

### Enums / constants

Symbol enum:

L1..L4, M1..M4, H1, H2, WILD, SCATTER, EMPTY

Mode enum:

BASE, BONUS

### Core structs/classes

GameConfig

Contains everything you tune:

Grid:
- rows = 8
- cols = 8

minClusterSize = 8
adjacency = N4
maxWinX = 15000

Bonus:
- triggerScatters = 3
- bonusSpins = 10
- bonusRetriggerSpins = 3
- maxBonusExtraSpins = 15 (optional)

Multiplier:
- initial cell multiplier = 1
- on-hit multiplier = *2
- payout multiplier method: avg = sum(mult) / size (sum-over-size)

Wild assignment:
- direct adjacency required (no wild chains)
- deterministic tie-break rules

Weights

- Base weights: Map<Symbol, int>
- Bonus weights: Map<Symbol, int>
- Precomputed cdf arrays for fast sampling

PayTable

Function:

pay(symbol, clusterSize) -> double (in x bet)

RNG interface (important)

Your engine should never call SecureRandom directly. It calls:

- nextInt(bound)
- nextLong() or nextBytes(n) optional

So you can swap in:

- Real RNG for production
- Deterministic RNG for tests/simulation

WeightedSampler

Given a Weights (cdf/total):

sampleSymbol(rng) -> Symbol

Grid

symbols[8][8]

Helper methods: get/set, inBounds, copy

MultiplierGrid

mult[8][8] (use long or big integer-safe handling)

Helper methods: reset, multiplyCell(r,c), sumOver(cells)

Component / Cluster

Component: base-only connected group

- id, symbol, cells, baseSize

Cluster: final cluster after wild assignment

- symbol, cells, size

SpinResult + SpinTranscript

Return both:

SpinResult (what player needs)

- totalWinX, baseWinX, bonusWinX
- bonusTriggered, bonusSpinsPlayed
- capHit

SpinTranscript (for testing + UI replay)

- initial grid
- per cascade step:
  - clusters found (cells, symbol, size)
  - win per cluster
  - cells removed
  - multiplier grid snapshot (optional, or just the changed cells)
  - resulting grid after drop + fill
- bonus section (spins + cascades)
