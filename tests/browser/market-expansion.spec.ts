import { test, expect } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`Robinhood prices, charts and activity windows at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const now = Math.floor(Date.now() / 3600000) * 3600;
  let chartCalls = 0;
  await page.route("**/api/market/history?**", (route) => {
    chartCalls++;
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("issuer")).toBe("robinhood");
    expect(params.get("chainId")).toBe("4663");
    return route.fulfill({ json: { state: "available", reason: null, symbol: "AAPL", chainId: 4663, interval: params.get("interval"), contract: `0x${"1".repeat(40)}`, pool: `0x${"2".repeat(40)}`, candles: [{ time: now - 3600, open: 100, high: 110, low: 95, close: 105, volume: 80 }, { time: now, open: 105, high: 115, low: 100, close: 112, volume: 70 }], retrievedAt: new Date().toISOString(), lastTradeAt: new Date(now * 1000).toISOString(), unit: "USD per token", volumeUnit: "USD", gaps: 0, finality: "Provider indexed; finality not guaranteed", sourceUrl: "https://www.geckoterminal.com/robinhood", incompleteFrom: now } });
  });
  let activityCalls = 0;
  await page.route("**/api/market/venues?**", (route) => {
    activityCalls++;
    return route.fulfill({ json: { state: "available", checkedAt: new Date().toISOString(), pairs: [{ chainId: 4663, contract: `0x${"1".repeat(40)}`, pairAddress: `0x${"2".repeat(40)}`, dex: "Uniswap V3", baseSymbol: "AAPL", quoteSymbol: "USDG", quoteContract: `0x${"3".repeat(40)}`, createdAt: null, priceUsd: "112", liquidityUsd: "5000", windows: [{ window: "h1", buys: 3, sells: 2, buyers: 2, sellers: 1, volumeUsd: "500", changePercent: -1.5 }, { window: "h24", buys: 12, sells: 8, buyers: 9, sellers: 5, volumeUsd: "5000", changePercent: 2.25 }, { window: "m5", buys: 0, sells: 0, buyers: 0, sellers: 0, volumeUsd: "0", changePercent: 0 }, { window: "h6", buys: 7, sells: 4, volumeUsd: "2000", changePercent: null }], retrievedAt: new Date().toISOString(), sourceObservedAt: null, sourceUrl: "https://www.geckoterminal.com/robinhood" }] } });
  });
  await page.goto("/market/AAPL");
  await expect(page.getByRole("img", { name: /Token price candlesticks/ })).toBeVisible();
  await expect(page.locator(".chart-metrics")).toContainText("+12.00%");
  await expect(page.locator(".chart-metrics")).toContainText("$150");
  const venue = page.locator(".venue-market");
  await expect(venue.locator(".market-metrics")).toContainText("+2.25%");
  await venue.getByRole("button", { name: "1h", exact: true }).click();
  await expect(venue.locator(".market-metrics")).toContainText("-1.50%");
  await expect(venue.getByRole("img")).toHaveAttribute("aria-label", "3 buys and 2 sells in the selected window");
  await venue.getByRole("button", { name: "5m", exact: true }).click();
  await expect(venue.locator(".market-metrics")).toContainText("$0.00");
  await expect(venue.locator(".market-metrics")).toContainText("0.00%");
  await expect(venue.getByRole("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Line", exact: true }).click();
  await expect(page.getByRole("img", { name: /Token price line chart/ })).toBeVisible();
  await page.getByRole("group", { name: "Candle interval" }).getByRole("button", { name: "15m", exact: true }).click();
  await expect.poll(() => chartCalls).toBeGreaterThan(1);
  await expect(page.getByRole("button", { name: "Refresh chart" })).toBeEnabled();
  await page.getByRole("button", { name: "Refresh chart" }).click();
  await expect.poll(() => chartCalls).toBeGreaterThan(2);
  await venue.getByRole("button", { name: "Refresh activity" }).click();
  await expect.poll(() => activityCalls).toBeGreaterThan(1);
  await page.screenshot({ path: `artifacts/market-expansion-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("xStocks activity requests retain the issuer and stale observations are marked", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/market/history?**", (route) => route.fulfill({ json: { state: "unavailable", reason: "No indexed trades", candles: [], retrievedAt: new Date().toISOString() } }));
  await page.route("**/api/market/venues?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    expect(params.get("issuer")).toBe("xstocks");
    expect(params.get("symbol")).toBe("AAPLx");
    calls++;
    return calls === 1 ? route.fulfill({ json: { state: "unavailable", reason: "pool_verification_unavailable", pairs: [], checkedAt: new Date().toISOString() } }) : route.fulfill({ status: 503 });
  });
  await page.goto("/xstocks/AAPLx");
  await expect(page.locator(".venue-market")).toContainText("pool verification unavailable");
  await page.getByRole("button", { name: "Refresh activity" }).click();
  await expect(page.locator(".venue-market")).toContainText("Activity refresh failed");
  await expect(page.getByText("Price unavailable", { exact: true })).toBeVisible();
});
