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
   * Execute a callback function with __codspeed_root_frame__ in its stack trace
   * @param callback Function to execute
   */
  __codspeed_root_frame__<T>(callback: () => T): T;
}
