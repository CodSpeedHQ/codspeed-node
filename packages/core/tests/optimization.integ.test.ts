import { execFileSync } from "child_process";
import path from "path";

// A function optimized without being marked for manual optimization first aborts
// the process on V8 >= 14.6, which no in-process assertion can observe. The helpers
// are exercised through the built package so the bundled natives calls are covered.
const runWithNatives = (snippet: string): string =>
  execFileSync(process.execPath, ["--allow-natives-syntax", "-e", snippet], {
    encoding: "utf8",
  });

const corePath = JSON.stringify(path.join(__dirname, ".."));

// %GetOptimizationStatus's bitmask layout shifts between V8 versions, so a
// specific bit isn't safe to assert on. Comparing the status before and after
// the optimize call instead proves TurboFan recompiled the function, without
// depending on what any bit means.
describe("optimization helpers", () => {
  it("should optimize a sync function without aborting", () => {
    const stdout = runWithNatives(
      `const target = () => 1;
       const before = %GetOptimizationStatus(target);
       require(${corePath}).optimizeFunctionSync(target);
       console.log("done", before, %GetOptimizationStatus(target));`,
    );
    const [, before, after] = stdout.match(/done (\d+) (\d+)/) ?? [];
    expect(stdout).toContain("done");
    expect(after).not.toEqual(before);
  });

  it("should optimize an async function without aborting", () => {
    const stdout = runWithNatives(
      `const target = async () => 1;
       const before = %GetOptimizationStatus(target);
       require(${corePath})
         .optimizeFunction(target)
         .then(() => console.log("done", before, %GetOptimizationStatus(target)));`,
    );
    const [, before, after] = stdout.match(/done (\d+) (\d+)/) ?? [];
    expect(stdout).toContain("done");
    expect(after).not.toEqual(before);
  });
});
