import { describe, test } from "vitest";
import parsePr from "./parsePr";

const LONG_BODY =
  new Array(1_000)
    .fill(
      "Lorem ipsum dolor sit amet consectetur adipisicing elit. Sunt, earum. Atque architecto vero veniam est tempora fugiat sint quo praesentium quia. Autem, veritatis omnis beatae iste delectus recusandae animi non.",
    )
    .join("\n") + "fixes #123";

describe("parsePr", () => {
  test("short body", async ({ bench }) => {
    await bench("short body", () => {
      parsePr({ body: "fixes #123", title: "test-1", number: 1 });
    }).run();
  });

  test("long body", async ({ bench }) => {
    await bench("long body", () => {
      parsePr({ body: LONG_BODY, title: "test-2", number: 2 });
    }).run();
  });
});

function fibo(n: number): number {
  if (n < 2) return 1;
  return fibo(n - 1) + fibo(n - 2);
}

describe("fibo", () => {
  test("fibo 10", async ({ bench }) => {
    await bench("fibo 10", () => {
      fibo(10);
    }).run();
  });
  test("fibo 15", async ({ bench }) => {
    await bench("fibo 15", () => {
      fibo(15);
    }).run();
  });
});
