/**
 * The wire shapes of the browser commands, shared by the page half (which may
 * not import anything node-native) and the node half implementing them.
 */

/**
 * Name the page publishes its measured round under, on the topmost window so
 * that it is reachable from the page's default execution context.
 */
export const ROUND_GLOBAL = "__codspeed_round__";

export interface CodSpeedRunRoundRequest {
  /** Vitest's `" > "`-separated task path, without the file. */
  fullTestName: string;
  name: string;
  rounds?: number;
}

export interface CodSpeedRunRoundResponse {
  /** How many rounds the benchmark is to be measured over, decided by the instrument mode. */
  rounds: number;
}
