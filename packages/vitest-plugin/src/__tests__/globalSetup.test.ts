import { describe, expect, it, vi } from "vitest";
import globalSetup from "../globalSetup";

console.log = vi.fn();

describe("globalSetup", () => {
  it("should log setup and teardown once, even when Vitest runs them per project", async () => {
    const teardown = globalSetup();

    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] @codspeed/vitest-plugin v1.0.0 - setup",
    );

    // Vitest 5 runs the same globalSetup for the base project and for the
    // benchmark project it clones from it.
    globalSetup();

    expect(console.log).toHaveBeenCalledTimes(1);

    teardown();

    expect(console.log).toHaveBeenCalledWith(
      "[CodSpeed] @codspeed/vitest-plugin v1.0.0 - teardown",
    );

    teardown();

    expect(console.log).toHaveBeenCalledTimes(2);
  });
});
