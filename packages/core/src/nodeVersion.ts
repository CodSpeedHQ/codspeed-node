/**
 * Majors CodSpeed is tested against. The native addon itself is built as a
 * single Node-API binary and loads on any major, so this only gates the
 * warning about measurement stability.
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

/**
 * Percent-encode the characters GitHub Actions treats as workflow-command
 * syntax, so a message cannot terminate or extend the command it is part of.
 *
 * See https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions
 */
function escapeWorkflowCommandData(value: string): string {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/**
 * Properties are parsed out of the command header, where `:` ends the property
 * list and `,` separates properties, so both need encoding on top of the data
 * escaping.
 */
function escapeWorkflowCommandProperty(value: string): string {
  return escapeWorkflowCommandData(value)
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

/**
 * On GitHub Actions the warning becomes an annotation, which is shown outside
 * the job log. Workflow commands must start a line, hence the direct stdout
 * write rather than a prefixed log call.
 */
export function warnCi(message: string, title: string): void {
  if (process.env.GITHUB_ACTIONS === "true") {
    process.stdout.write(
      `::warning title=${escapeWorkflowCommandProperty(title)}::${escapeWorkflowCommandData(message)}\n`,
    );
    return;
  }
  if (process.env.GITLAB_CI === "true") {
    // GitLab CI has no annotation mechanism, so colour the line to make it
    // stand out in the job log.
    console.warn(`\x1b[33m${message}\x1b[0m`);
    return;
  }
  console.warn(message);
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
  warnCi(warning, "Unsupported Node.js version");
}
