import { describe, expect, it, vi } from "vitest";
import globalSetup from "../globalSetup";

console.log = vi.fn();

describe("globalSetup", () => {
  it("should log the correct message on setup and teardown, and fail when teardown is called twice", async () => {
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
});
