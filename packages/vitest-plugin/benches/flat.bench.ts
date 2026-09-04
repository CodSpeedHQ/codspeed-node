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

describe("parsePr", () => {
  test("body size", async ({ bench }) => {
    await bench.compare(
      bench("short body", () => {
        parsePr({ body: "fixes #123", title: "test-1", number: 1 });
      }),
      bench("long body", () => {
        parsePr({ body: LONG_BODY, title: "test-2", number: 2 });
      }),
    );
  });
});

function fibo(n: number): number {
  if (n < 2) return 1;
  return fibo(n - 1) + fibo(n - 2);
}

describe("fibo", () => {
  test("depth", async ({ bench }) => {
    await bench("fibo 10", () => {
      fibo(10);
    }).run();

    await bench("fibo 15", () => {
      fibo(15);
    }).run();
  });
});
