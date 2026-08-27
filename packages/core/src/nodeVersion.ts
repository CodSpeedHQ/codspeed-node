/**
 * Majors the native addon ships prebuilds for, as listed in the
 * `build-native-addon` targets in package.json. Prebuilds are matched on the
 * exact ABI version, so on any other major the addon only loads when it has
 * been compiled from source locally.
 */
export const SUPPORTED_NODE_MAJORS = [22, 24];

export function getUnsupportedNodeVersionWarning(
  version: string,
): string | null {
  const major = parseInt(version.split(".")[0], 10);
  if (SUPPORTED_NODE_MAJORS.includes(major)) {
    return null;
  }
  return `[CodSpeed] Node.js v${version} is not supported: CodSpeed is tested on Node.js ${SUPPORTED_NODE_MAJORS.join(", ")}. Support for other versions is experimental and measurements may be unstable.`;
}

let hasWarned = false;

/**
 * Integrations call their setup path per suite or per worker, so the warning is
 * latched to once per process.
 */
export function warnOnUnsupportedNodeVersion(): void {
  if (hasWarned) {
    return;
  }
  const warning = getUnsupportedNodeVersionWarning(process.versions.node);
  if (warning === null) {
    return;
  }
  hasWarned = true;
  console.warn(warning);
}
