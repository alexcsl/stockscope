import { test, expect } from "@playwright/test";

const catalog = { complete: true, reason: null, retrievedAt: "2026-10-24T00:00:00.000Z", assets: [{ symbol: "NVDAx", name: "NVIDIA xStock", contract: `0x${"4".repeat(40)}`, underlying: "NVDA", isin: null }] };

for (const payload of [{}, { ...catalog, assets: [null] }, { ...catalog, assets: [{ ...catalog.assets[0], symbol: null }] }]) test(`invalid catalog is recoverable for ${JSON.stringify(payload)}`, async ({ page }) => {
  let failed = true;
  await page.route("**/api/market/catalog", (route) => route.fulfill({ json: failed ? payload : catalog }));
  await page.goto("/terminal?market=robinhood&q=AAPL");
  await expect(page.getByText("xStocks catalog unavailable. Robinhood records remain accessible.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stock Tokens", exact: true })).toBeVisible();
  await expect(page.locator(".sourced-row")).toHaveCount(1);
  failed = false;
  await page.getByRole("button", { name: "Retry xStocks catalog" }).click();
  await expect(page.getByText("All discovered catalog pages loaded.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search Stock Tokens" })).toHaveValue("AAPL");
  await expect(page.locator(".market-picker select")).toHaveValue("robinhood");
});

for (const width of [1440, 390]) test(`storage denial preserves terminal and URL comparison at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage is disabled", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage is disabled", "SecurityError"); };
  });
  await page.route("**/api/market/catalog", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/market/comparison?**", (route) => route.fulfill({ json: { issuer: "robinhood", symbol: "AAPL", name: "Apple", contract: null, state: "unavailable", multiplier: null, pair: null, reason: "Fixture source unavailable" } }));
  await page.goto("/terminal?market=robinhood&q=AAPL");
  await expect(page.getByRole("heading", { name: "Stock Tokens", exact: true })).toBeVisible();
  await expect(page.getByText("Browser storage unavailable. Comparison selections cannot be persisted.")).toBeVisible();
  await page.getByRole("link", { name: "Compare issuer", exact: true }).click();
  await expect(page.locator(".comparison-tray")).toContainText("AAPL");
  await page.reload();
  await expect(page.locator(".comparison-tray")).toContainText("AAPL");
  await expect(page.getByRole("textbox", { name: "Search Stock Tokens" })).toHaveValue("AAPL");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
