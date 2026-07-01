import { describe, test } from "vitest";
import parsePr from "./parsePr";

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
  test("short body", async ({ bench }) => {
    await bench("short body", benchShortBody).run();
  });

  test("long body", async ({ bench }) => {
    await bench("long body", benchLongBody).run();
  });

  describe("nested suite", () => {
    test("short body", async ({ bench }) => {
      await bench("short body", benchShortBody).run();
    });

    test("long body", async ({ bench }) => {
      await bench("long body", benchLongBody).run();
    });

    describe("deeply nested suite", () => {
      test("short body", async ({ bench }) => {
        await bench("short body", benchShortBody).run();
      });
    });
  });
});

describe("another parsePr", () => {
  test("short body", async ({ bench }) => {
    await bench("short body", benchShortBody).run();
  });

  test("long body", async ({ bench }) => {
    await bench("long body", benchLongBody).run();
  });

  describe("nested suite", () => {
    test("short body", async ({ bench }) => {
      await bench("short body", benchShortBody).run();
    });
  });
});
