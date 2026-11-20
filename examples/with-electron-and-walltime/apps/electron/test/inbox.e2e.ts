import { bench, type Page } from "@codspeed/playwright-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

async function waitUntilSettled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const main = document.getElementById("main");
    return !!main && !main.classList.contains("loading");
  });
}

await bench(
  "inbox-search-archive-threads",
  async ({ page }) => {
    await page.fill("#search", "update");
    await waitUntilSettled(page);

    await page.click("#select-visible-btn");
    await page.click("#archive-btn");
    await waitUntilSettled(page);

    await page.click('#sidebar nav button[data-view="threads"]');
    await waitUntilSettled(page);
  },
  {
    target: {
      kind: "electron",
      appPath: path.join(appRoot, "out/main/index.js"),
      cwd: appRoot,
      // Keep Chromium's shared memory in /tmp: CI runners may lack /dev/shm.
      electronArgs: ["--disable-dev-shm-usage"],
    },
    beforeRound: async ({ page }) => {
      page.setDefaultTimeout(180_000);
      await page.waitForSelector("#main");
      await waitUntilSettled(page);
    },
  },
);
