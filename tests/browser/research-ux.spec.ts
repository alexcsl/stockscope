import { test, expect } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`search, pagination and comparison recovery at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/market/catalog", (route) => route.fulfill({ json: { complete: true, reason: null, retrievedAt: new Date().toISOString(), assets: Array.from({ length: 45 }, (_, index) => ({ symbol: `STOCK${index}x`, name: `Company ${index}`, contract: `0x${"1".repeat(40)}`, underlying: `STOCK${index}`, isin: null })) } }));
  await page.route("**/api/market/comparison?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const [issuer, symbol] = new URL(route.request().url()).searchParams.get("asset")!.split(":");
    await route.fulfill({ json: { issuer, symbol, name: symbol, contract: `0x${"1".repeat(40)}`, state: "verified", multiplier: "1", pair: null, reason: "No verified pool is available." } });
  });
  await page.goto("/compare");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search all discovered stocks" }).fill("Company 43");
  await expect(page.locator(".catalog-item")).toHaveCount(1);
  await page.locator(".catalog-item").click();
  await expect(page.locator(".comparison-tray")).toContainText("1 of 4 selected");
  await expect(page.locator(".comparison-card")).toContainText("Identity verified");
  await expect(page.locator(".comparison-card")).toContainText("source observation times are unknown");
  await page.reload();
  await expect(page.locator(".comparison-tray")).toContainText("STOCK43x");
  await page.screenshot({ path: `artifacts/research-comparison-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const width of [1440, 390, 320]) test(`candles, attribution, gaps and accessible explanations at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const now = Math.floor(Date.now() / 3600000) * 3600;
  await page.route("**/api/market/history?**", (route) => route.fulfill({ json: { state: "available", reason: null, symbol: "AAPLx", chainId: 42161, contract: `0x${"1".repeat(40)}`, pool: `0x${"2".repeat(64)}`, interval: "1h", candles: [{ time: now - 7200, open: 100, high: 110, low: 95, close: 105, volume: 80 }, { time: now, open: 105, high: 115, low: 100, close: 112, volume: 70 }], retrievedAt: new Date().toISOString(), lastTradeAt: new Date(now * 1000).toISOString(), unit: "USD per token", volumeUnit: "USD", gaps: 1, finality: "Provider indexed; finality not guaranteed", sourceUrl: "https://www.geckoterminal.com/arbitrum", incompleteFrom: now } }));
  await page.goto("/assets/aaplx");
  await expect(page.getByRole("img", { name: /Token price candlesticks/ })).toBeVisible();
  await expect(page.getByText("USD per AAPLx token / last indexed close")).toBeVisible();
  const help = page.getByRole("button", { name: "About Candlesticks" });
  await help.focus();
  await expect(page.getByRole("note").filter({ hasText: "Each candle shows" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await help.click();
  await expect(help).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Close Candlesticks explanation" }).click();
  await expect(help).toHaveAttribute("aria-expanded", "false");
  await page.getByText("Source, coverage, and candle data", { exact: true }).click();
  await expect(page.getByText("Missing intervals: 1. No forward filling.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Latest 20 indexed candles, UTC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TradingView Lightweight Charts" })).toBeVisible();
  await page.screenshot({ path: `artifacts/candles-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("chart source failure never displays sample prices", async ({ page }) => {
  await page.route("**/api/market/history?**", (route) => route.fulfill({ json: { state: "unavailable", reason: "Exact pool verification failed", candles: [], retrievedAt: new Date().toISOString() } }));
  await page.goto("/assets/aaplx");
  await expect(page.getByText("Price unavailable", { exact: true })).toBeVisible();
  await expect(page.locator(".candle-placeholder")).toContainText("Exact pool verification failed");
  await expect(page.getByText("Sample token price")).toHaveCount(0);
});

test("catalog source delay does not block the comparison shell", async ({ page }) => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/market/catalog", async (route) => { await wait; await route.fulfill({ json: { complete: false, reason: "Partial discovery", retrievedAt: new Date().toISOString(), assets: [] } }); });
  await page.goto("/compare", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Compare stock tokens" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search all discovered stocks" }).fill("AAPL");
  await page.locator(".catalog-item").click();
  await expect(page.locator(".comparison-tray")).toContainText("AAPL");
  release();
  await expect(page.getByText("Partial discovery")).toBeVisible();
});

test("warmed navigation shows the comparison shell within 250 ms", async ({ page }) => {
  await page.route("**/api/market/catalog", (route) => route.fulfill({ json: { complete: true, assets: [], reason: null, retrievedAt: new Date().toISOString() } }));
  await page.goto("/demo");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Compare", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Compare stock tokens" })).toBeVisible();
  const measurements: number[] = [];
  for (let run = 0; run < 3; run++) {
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Demo", exact: true }).click();
    await expect(page.locator("#hero-title")).toBeVisible();
    await page.evaluate(() => {
      const timing = window as Window & { navigationElapsed?: number };
      timing.navigationElapsed = undefined;
      document.querySelector('.primary-nav a[href="/compare"]')!.addEventListener("click", () => {
        const start = performance.now();
        const observer = new MutationObserver(() => {
          if (document.querySelector("main h1")?.textContent === "Compare stock tokens") { timing.navigationElapsed = performance.now() - start; observer.disconnect(); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }, { once: true });
    });
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Compare", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Compare stock tokens" })).toBeVisible();
    const elapsed = await page.evaluate(() => (window as Window & { navigationElapsed?: number }).navigationElapsed);
    expect(elapsed).toBeDefined();
    measurements.push(elapsed!);
    expect(elapsed!).toBeLessThanOrEqual(250);
  }
  console.log(`Warmed comparison shell (ms): ${measurements.map((value) => value.toFixed(1)).join(", ")}`);
});
