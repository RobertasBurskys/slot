export interface Rng {
  nextInt(bound: number): number;
  nextLong?(): bigint;
  nextBytes?(n: number): Uint8Array;
}
