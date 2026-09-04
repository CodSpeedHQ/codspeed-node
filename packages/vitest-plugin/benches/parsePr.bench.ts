import { describe, test } from "vitest";
import parsePrExport from "./parsePr";

// Read the imported binding once: Vite's module runner exposes exports through
// getters, and reading one inside the measured loop adds overhead to every
// iteration (Vitest warns about it).
const parsePr = parsePrExport;

const LONG_BODY =
  new Array(1_000)
    .fill(
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Sunt, earum. Atque architecto vero veniam est tempora fugiat sint quo praesentium quia. Autem, veritatis omnis beatae iste delectus recusandae animi non.",
    )
    .join("\n") + "fixes #123";

function benchShortBody() {
  parsePr({ body: "fixes #123", title: "test", number: 124 });
}

function benchLongBody() {
  parsePr({ body: LONG_BODY, title: "test", number: 124 });
}

describe("parsePr", () => {
  test("body size", async ({ bench }) => {
    await bench.compare(
      bench("short body", benchShortBody),
      bench("long body", benchLongBody),
    );
  });

  describe("nested suite", () => {
    test("body size", async ({ bench }) => {
      await bench.compare(
        bench("short body", benchShortBody),
        bench("long body", benchLongBody),
      );
    });

    describe("deeply nested suite", () => {
      test("body size", async ({ bench }) => {
        await bench("short body", benchShortBody).run();
      });
    });
  });
});

describe("another parsePr", () => {
  test("body size", async ({ bench }) => {
    await bench.compare(
      bench("short body", benchShortBody),
      bench("long body", benchLongBody),
    );
  });

  describe("nested suite", () => {
    test("body size", async ({ bench }) => {
      await bench("short body", benchShortBody).run();
    });
  });
});
