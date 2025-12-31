import { Symbol } from "../engine/types";

export type PayTable = (symbol: Symbol, clusterSize: number) => number;
