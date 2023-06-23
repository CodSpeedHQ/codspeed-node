import { Suite } from "benchmark";
import buildSuiteAdd from "../buildSuiteAdd";
import { CodSpeedBenchmark } from "../types";

describe("buildSuiteAdd", () => {
  let emptyBench: () => void;
  let suite: Suite;

  beforeEach(() => {
    emptyBench = () => {
      return;
    };
    suite = new Suite();
  });

  it("should register benchmark name when using (options: Options)", () => {
    suite.add = buildSuiteAdd(suite);
    suite.add({ name: "test", fn: emptyBench });
    suite.forEach((bench: CodSpeedBenchmark) =>
      expect(bench.uri).toBe(
        "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::test"
      )
    );
  });

  it("should register benchmark name when using (fn: Function, options?: Options)", () => {
    suite.add = buildSuiteAdd(suite);
    suite.add(emptyBench, { name: "test" });
    suite.forEach((bench: CodSpeedBenchmark) =>
      expect(bench.uri).toBe(
        "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::test"
      )
    );
  });

  it("should register benchmark name when using (name: string, options?: Options)", () => {
    suite.add = buildSuiteAdd(suite);
    suite.add("test", { fn: emptyBench });
    suite.forEach((bench: CodSpeedBenchmark) =>
      expect(bench.uri).toBe(
        "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::test"
      )
    );
  });

  it("should register benchmark name when using (name: string, fn: Function, options?: Options)", () => {
    suite.add = buildSuiteAdd(suite);
    suite.add("test", emptyBench);
    suite.forEach((bench: CodSpeedBenchmark) =>
      expect(bench.uri).toBe(
        "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::test"
      )
    );
  });

  it("should register benchmark name when suite name is defined", () => {
    suite.name = "suite";
    suite.add = buildSuiteAdd(suite);
    suite.add("test", emptyBench);
    suite.forEach((bench: CodSpeedBenchmark) =>
      expect(bench.uri).toBe(
        "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::suite::test"
      )
    );
  });

  it("should call rawAdd with options object", () => {
    const rawAdd = jest.fn();
    suite.add = rawAdd;
    suite.add = buildSuiteAdd(suite);
    const options = { name: "test", delay: 100 };
    suite.add(options);
    expect(rawAdd).toHaveBeenCalledWith(options);
  });

  it("should call rawAdd with function and options object", () => {
    const rawAdd = jest.fn();
    suite.add = rawAdd;
    suite.add = buildSuiteAdd(suite);
    const fn = emptyBench;
    const options = { name: "test", delay: 100 };
    suite.add("test", fn, options);
    expect(rawAdd).toHaveBeenCalledWith("test", fn, {
      ...options,
      uri: "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::test",
    });
  });

  it("should call rawAdd with name and options object", () => {
    const rawAdd = jest.fn();
    suite.add = rawAdd;
    suite.add = buildSuiteAdd(suite);
    const options = { name: "test", delay: 100 };
    suite.add("test", options);
    expect(rawAdd).toHaveBeenCalledWith("test", options);
  });

  it("should call rawAdd with function and undefined options", () => {
    const rawAdd = jest.fn();
    suite.add = rawAdd;
    suite.add = buildSuiteAdd(suite);
    const fn = emptyBench;
    suite.add("test", fn);
    expect(rawAdd).toHaveBeenCalledWith("test", fn, {
      uri: "packages/benchmark.js-plugin/src/__tests__/buildSuiteAdd.test.ts::test",
    });
  });
});
