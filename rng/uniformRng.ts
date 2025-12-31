import { Rng } from "./rng";

const TWO_POW_32 = 0x1_0000_0000;

export function uniformInt(rng: Rng, bound: number): number {
  if (bound <= 0) {
    return 0;
  }
  if (bound === 1) {
    return 0;
  }
  const limit = TWO_POW_32 - (TWO_POW_32 % bound);
  while (true) {
    const r = nextUint32(rng);
    if (r < limit) {
      return r % bound;
    }
  }
}

function nextUint32(rng: Rng): number {
  if (rng.nextBytes) {
    const b = rng.nextBytes(4);
    return (
      (b[0] ?? 0) |
      ((b[1] ?? 0) << 8) |
      ((b[2] ?? 0) << 16) |
      ((b[3] ?? 0) << 24)
    ) >>> 0;
  }
  const v = rng.nextInt(0x7fff_ffff);
  const hi = v & 0xffff;
  const lo = (v >>> 15) & 0xffff;
  return ((hi << 16) | lo) >>> 0;
}
