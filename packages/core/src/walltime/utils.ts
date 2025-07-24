/**
 * Converts nanoseconds to milliseconds.
 * @param ns - the nanoseconds to convert
 * @returns the milliseconds
 */
export const nsToMs = (ns: number) => ns / 1e6;

/**
 * Converts milliseconds to nanoseconds.
 * @param ms - the milliseconds to convert
 * @returns the nanoseconds
 */
export const msToNs = (ms: number) => ms * 1e6;

/**
 * Converts milliseconds to seconds.
 * @param ms - the milliseconds to convert
 * @returns the seconds
 */
export const msToS = (ms: number) => ms / 1e3;
