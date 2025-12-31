import { Symbol, Coord } from "./types";

export class Grid {
  readonly rows: number;
  readonly cols: number;
  private symbols: Symbol[][];

  constructor(rows: number, cols: number, fill: Symbol = Symbol.EMPTY) {
    this.rows = rows;
    this.cols = cols;
    this.symbols = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => fill),
    );
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  get(r: number, c: number): Symbol {
    return this.symbols[r][c];
  }

  set(r: number, c: number, value: Symbol): void {
    this.symbols[r][c] = value;
  }

  getCoord(coord: Coord): Symbol {
    return this.get(coord.r, coord.c);
  }

  setCoord(coord: Coord, value: Symbol): void {
    this.set(coord.r, coord.c, value);
  }

  copy(): Grid {
    const g = new Grid(this.rows, this.cols);
    g.symbols = this.symbols.map((row) => row.slice());
    return g;
  }

  snapshot(): Symbol[][] {
    return this.symbols.map((row) => row.slice());
  }
}
