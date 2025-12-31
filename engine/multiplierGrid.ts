import { Coord } from "./types";

export class MultiplierGrid {
  readonly rows: number;
  readonly cols: number;
  private mult: number[][];
  private readonly initial: number;
  private readonly cap: number;

  constructor(rows: number, cols: number, initial = 1, cap = 2 ** 40) {
    this.rows = rows;
    this.cols = cols;
    this.initial = initial;
    this.cap = cap;
    this.mult = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => initial),
    );
  }

  reset(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.mult[r][c] = this.initial;
      }
    }
  }

  multiplyCell(r: number, c: number, factor: number): void {
    if (this.mult[r][c] >= this.cap) {
      this.mult[r][c] = this.cap;
      return;
    }
    const next = this.mult[r][c] * factor;
    this.mult[r][c] = next > this.cap ? this.cap : next;
  }

  multiplyCoord(coord: Coord, factor: number): void {
    this.multiplyCell(coord.r, coord.c, factor);
  }

  sumOver(cells: Coord[]): number {
    let sum = 0;
    for (const cell of cells) {
      sum += this.mult[cell.r][cell.c];
    }
    return sum;
  }

  productOver(cells: Coord[], cap = 1e12): number {
    let product = 1;
    for (const cell of cells) {
      product *= this.mult[cell.r][cell.c];
      if (product >= cap) {
        return cap;
      }
    }
    return product;
  }

  snapshot(): number[][] {
    return this.mult.map((row) => row.slice());
  }
}
