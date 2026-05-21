export interface InstrumentHooks {
  /**
   * Check if instrumentation is enabled
   */
  isInstrumented(): boolean;

  /**
   * Start benchmark measurement
   * @returns 0 on success, non-zero on error
   */
  startBenchmark(): number;

  /**
   * Stop benchmark measurement
   * @returns 0 on success, non-zero on error
   */
  stopBenchmark(): number;

  /**
   * Set the executed benchmark metadata
   * @param pid Process ID
   * @param uri Benchmark URI/identifier
   * @returns 0 on success, non-zero on error
   */
  setExecutedBenchmark(pid: number, uri: string): number;

  /**
   * Set integration metadata
   * @param name Integration name
   * @param version Integration version
   * @returns 0 on success, non-zero on error
   */
  setIntegration(name: string, version: string): number;

  /**
   * Register a key-value pair under a named environment section.
   * @param sectionName Section name (e.g. "Node.js")
   * @param key Key name (e.g. "version")
   * @param value Value (e.g. "22.0.0")
   * @returns 0 on success, non-zero on error
   */
  setEnvironment(sectionName: string, key: string, value: string): number;

  /**
   * Flush all registered environment sections to disk.
   * @param pid Process ID
   * @returns 0 on success, non-zero on error
   */
  writeEnvironment(pid: number): number;

  /**
   * Returns a high-resolution timestamp (nanoseconds) suitable for marker
   * emission. Mirrors `instrument_hooks_current_timestamp` in the C API.
   */
  currentTimestamp(): bigint;

  /**
   * Emit a marker for the given pid at the given timestamp.
   * @param pid Process ID
   * @param markerType One of MARKER_TYPE_*
   * @param timestamp Timestamp (typically obtained from `currentTimestamp()`)
   * @returns 0 on success, non-zero on error
   */
  addMarker(pid: number, markerType: number, timestamp: bigint): number;

  /**
   * Execute a callback function with __codspeed_root_frame__ in its stack trace
   * @param callback Function to execute
   */
  __codspeed_root_frame__<T>(callback: () => T): T;
}

export const MARKER_TYPE_SAMPLE_START = 0;
export const MARKER_TYPE_SAMPLE_END = 1;
export const MARKER_TYPE_BENCHMARK_START = 2;
export const MARKER_TYPE_BENCHMARK_END = 3;
