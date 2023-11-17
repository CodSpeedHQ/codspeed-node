import { describe, expect, it, vi } from "vitest";

console.log = vi.fn();

async function importFreshGlobalSetup() {
  return (
    (await import(
      `../globalSetup?${Date.now()}`
    )) as typeof import("../globalSetup")
  ).default;
}

describe("globalSetup", async () => {
  it("with version, should log the correct message on setup and teardown, and fail when teardown is called twice", async () => {
    vi.stubGlobal("__VERSION__", "1.0.0");
    const globalSetup = await importFreshGlobalSetup();
    const teardown = globalSetup();

    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] @codspeed/vitest-plugin v1.0.0 - setup"
    );

    teardown();

    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] @codspeed/vitest-plugin v1.0.0 - teardown"
    );

    expect(() => teardown()).toThrowError("teardown called twice");
  });

  it("without version, should log the correct message on setup and teardown, and fail when teardown is called twice", async () => {
    vi.unstubAllGlobals();
    const globalSetup = await importFreshGlobalSetup();
    const teardown = globalSetup();

    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] @codspeed/vitest-plugin - setup"
    );

    teardown();

    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] @codspeed/vitest-plugin - teardown"
    );

    expect(() => teardown()).toThrowError("teardown called twice");
  });
});
