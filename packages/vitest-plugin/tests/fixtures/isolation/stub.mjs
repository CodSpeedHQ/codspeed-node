// Preloaded with `node --import` into the Vitest process, its workers, and the
// Vitest runs that process isolation starts.
import { InstrumentHooks } from "@codspeed/core";
import { appendFileSync } from "fs";

// There is no instrument hook runtime outside the CodSpeed runner, so pretend
// the hooks are active.
InstrumentHooks.isInstrumented = () => true;

// Vitest swallows what workers print, so the PID that measures each benchmark
// goes to a file.
const setExecutedBenchmark = InstrumentHooks.setExecutedBenchmark;
InstrumentHooks.setExecutedBenchmark = (pid, uri) => {
  setExecutedBenchmark(pid, uri);
  appendFileSync(process.env.ISOLATION_LOG_FILE, `executed ${pid} ${uri}\n`);
};
