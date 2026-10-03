import { defineConfig } from "@playwright/test";

const port = process.env.STOCKSCOPE_TEST_PORT || "3100";
const serverMode = process.env.STOCKSCOPE_BROWSER_DEV === "1" ? "dev" : "start";

export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 60000,
  use: { baseURL: `http://localhost:${port}`, channel: "chrome", trace: "retain-on-failure" },
  webServer: { command: `node --import ./tests/browser/provider-fixtures.mjs ./node_modules/next/dist/bin/next ${serverMode} --port ${port}`, url: `http://localhost:${port}`, reuseExistingServer: false, timeout: 60000 },
});
