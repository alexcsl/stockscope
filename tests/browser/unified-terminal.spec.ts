import { test, expect } from "@playwright/test";

const contract = `0x${"4".repeat(40)}`;
const catalog = { complete: true, reason: null, retrievedAt: new Date().toISOString(), assets: [{ symbol: "NVDAx", name: "NVIDIA xStock", contract, underlying: "NVDA", isin: null }] };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/market/catalog", (route) => route.fulfill({ json: catalog }));
});

for (const width of [1440, 390, 320]) test(`unified markets and issuer boundaries at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/terminal");
  await expect(page.locator(".sourced-row")).toHaveCount(4);
  await expect(page.locator(".primary-nav a")).toHaveText(["Overview", "Terminal", "Swap", "Account"]);
  const market = page.locator(".market-picker").getByRole("combobox", { name: "Market", exact: true });
  await market.selectOption("xstocks");
  await expect(page.locator(".sourced-row")).toHaveCount(1);
  await expect(page.locator(".sourced-row")).toContainText("xStocks / Arbitrum One / 42161");
  await page.getByRole("button", { name: "Watch NVDAx / xstocks", exact: true }).click();
  await expect(page.getByRole("button", { name: "NVDAx Watching", exact: true })).toBeVisible();
  await page.reload();
  await expect(market).toHaveValue("xstocks");
  await expect(page.getByRole("button", { name: "Watch NVDAx / xstocks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await market.selectOption("robinhood");
  await expect(page.locator(".sourced-row")).toHaveCount(3);
  await page.goBack();
  await expect(market).toHaveValue("xstocks");
  await page.getByRole("button", { name: "Watch NVDAx / xstocks", exact: true }).click();
  await expect(page.getByRole("button", { name: "NVDAx Watching", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("legacy demo and asset links retain the xStocks market", async ({ page }) => {
  await page.route("**/api/market/history?**", (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("issuer")).toBe("xstocks");
    expect(query.get("chainId")).toBe("42161");
    return route.fulfill({ json: { state: "unavailable", reason: "Verified Uniswap pool candles unavailable", candles: [], retrievedAt: new Date().toISOString() } });
  });
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/terminal\?market=xstocks$/);
  await expect(page.locator(".sourced-row .asset-link")).toHaveCount(1);
  await page.locator(".sourced-row .asset-link").click();
  await expect(page).toHaveURL(/\/xstocks\/NVDAx$/);
  await expect(page.getByRole("heading", { name: "NVDAx", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terminal", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Verified Uniswap pool candles unavailable").first()).toBeVisible();
  await page.getByRole("link", { name: "Back to terminal / xStocks", exact: true }).click();
  await expect(page).toHaveURL(/market=xstocks/);
  await page.goto("/assets/nvdax");
  await expect(page).toHaveURL(/\/xstocks\/nvdax$/);
  await expect(page.getByRole("heading", { name: "NVDAx", exact: true })).toBeVisible();
});

test("comparison is embedded and preserves the market desk query", async ({ page }) => {
  await page.route("**/api/market/comparison?**", (route) => {
    const [issuer, symbol] = new URL(route.request().url()).searchParams.get("asset")!.split(":");
    return route.fulfill({ json: { issuer, symbol, name: symbol, contract, state: "verified", multiplier: "1", pair: null, reason: "No verified pool" } });
  });
  await page.goto("/terminal?market=xstocks&q=NVDA");
  await expect(page.locator(".sourced-row")).toHaveCount(1);
  await expect(page.locator(".sourced-row")).toContainText("NVDAx");
  await page.locator(".sourced-row").getByRole("link", { name: "Compare issuer", exact: true }).click();
  await expect(page).toHaveURL(/\/terminal\?.*#compare$/);
  await expect(page.locator(".comparison-tray")).toContainText("NVDAx");
  await page.getByRole("searchbox", { name: "Search all discovered stocks" }).fill("Apple");
  await expect(page.locator(".market-picker select")).toHaveValue("xstocks");
  await page.goto("/compare?assets=robinhood:AAPL,xstocks:NVDAx");
  await expect(page).toHaveURL(/\/terminal\?.*#compare$/);
  await expect(page.locator(".comparison-tray")).toContainText("2 of 4 selected");
});

test("xStocks catalog failure leaves Robinhood usable", async ({ page }) => {
  await page.route("**/api/market/catalog", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/terminal");
  await expect(page.getByText("xStocks catalog unavailable. Robinhood records remain accessible.")).toBeVisible();
  await expect(page.locator(".sourced-row")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Retry xStocks catalog" })).toBeVisible();
});

test("wallet-connected quotes invalidate on account changes and keep execution separate", async ({ page }) => {
  const user = `0x${"1".repeat(40)}`;
  await page.addInitScript((user) => {
    const handlers: Record<string, () => void> = {};
    Object.assign(window, { quoteWalletHandlers: handlers });
    Object.defineProperty(window, "ethereum", { value: { request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return [user];
      throw new Error(`Unexpected wallet request: ${method}`);
    }, on: (event: string, callback: () => void) => { handlers[event] = callback; }, removeListener: (event: string) => { delete handlers[event]; } } });
  }, user);
  await page.route("**/api/market/uniswap", (route) => {
    expect(route.request().postDataJSON().swapper).toBe(user);
    return route.fulfill({ json: { state: "available", symbol: "AAPL", sizeUsd: 1000, inputAmount: "1000000000", outputAmount: "1000000000000000000", routing: "CLASSIC", checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 15000).toISOString() } });
  });
  await page.goto("/robinhood");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Public wallet address" })).toHaveValue(user);
  await page.getByRole("button", { name: "Check route", exact: true }).click();
  await expect(page.getByText("Estimated output", { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { quoteWalletHandlers: Record<string, () => void> }).quoteWalletHandlers.accountsChanged());
  await expect(page.getByRole("textbox", { name: "Public wallet address" })).toHaveValue("");
  await expect(page.getByText("Estimated output", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Testnet swap", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check before signing" })).toBeVisible();
  await page.getByRole("combobox", { name: "Market", exact: true }).selectOption("xstocks");
  await expect(page.getByRole("heading", { name: "xStocks swap availability" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review in wallet and submit" })).toHaveCount(0);
});
