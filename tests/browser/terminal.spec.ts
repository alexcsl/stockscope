import { test, expect } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`editorial landing remains usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /The market desk for Stock Tokens/ })).toBeVisible();
  await expect(page.getByText("Illustrative product film. It contains no market prices, live quotes, or trade approval.")).toBeVisible();
  await expect(page.locator(".landing-film video source")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `artifacts/landing-${width}.png`, fullPage: true });
  await page.locator(".landing-hero-copy").getByRole("link", { name: /Open terminal/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/terminal$/, { timeout: 20000 });
});

test("landing sections reveal on scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const firstMethod = page.locator(".landing-method li").first();
  await expect(firstMethod).toHaveCSS("opacity", "0.35");
  await firstMethod.scrollIntoViewIfNeeded();
  await expect(firstMethod).toHaveCSS("opacity", "1");
});

test("quote sizes preserve independent failures and do not change action eligibility", async ({ page }) => {
  await page.route("**/api/market/uniswap", async (route) => {
    const body = route.request().postDataJSON() as { sizeUsd: number };
    await route.fulfill({ json: body.sizeUsd === 5 ? { state: "no_route", checkedAt: "2026-09-26T00:00:00Z", symbol: "AAPL", sizeUsd: 5 } : { state: "available", checkedAt: "2026-09-26T00:00:00Z", expiresAt: "2026-09-26T00:00:15Z", symbol: "AAPL", sizeUsd: body.sizeUsd, inputAmount: String(body.sizeUsd * 1_000_000), outputAmount: String(BigInt(body.sizeUsd) * BigInt(25_000_000_000_000_000)), routing: "CLASSIC" } });
  });
  await page.goto("/market/aapl");
  await page.getByRole("textbox", { name: "Public address for quote context" }).fill(`0x${"1".repeat(40)}`);
  await page.getByRole("button", { name: "Check buy and sell sizes" }).click();
  await expect(page.locator(".quote-comparison-item").first()).toContainText("40 USDG per AAPL");
  await expect(page.locator(".quote-comparison-item").nth(1)).toContainText("no route");
  await expect(page.locator(".quote-comparison-item").last()).toContainText("Expired");
  await expect(page.getByRole("button", { name: "Review in wallet and submit" })).toHaveCount(0);
});

test("watchlist, saved view and evidence alert survive reload", async ({ page }) => {
  let checks = 0;
  await page.route("**/api/market/venues?symbol=AAPL", async (route) => {
    checks++;
    await route.fulfill({ json: { state: "available", checkedAt: `2026-09-28T10:0${checks}:00Z`, pairs: [{ liquidityUsd: checks === 1 ? "120" : "90", sourceUrl: "https://dexscreener.com/robinhood/pair" }] } });
  });
  await page.route("**/api/research/events?symbol=AAPL", (route) => route.fulfill({ json: { state: "available", eventIds: [] } }));
  await page.goto("/terminal");
  await expect(page.getByRole("heading", { name: "Your desk" })).toBeVisible();
  await page.getByRole("button", { name: "AAPL Add" }).click();
  await page.getByRole("textbox", { name: "View name" }).fill("Market review");
  await page.getByRole("button", { name: "Save current view" }).click();
  await page.getByRole("combobox", { name: "Alert asset" }).selectOption({ label: "AAPL" });
  await page.getByRole("spinbutton", { name: "Liquidity threshold in USD" }).fill("100");
  await page.getByRole("button", { name: "Add alert" }).click();
  await page.getByRole("button", { name: "Refresh watched evidence" }).click();
  await expect.poll(() => checks).toBe(1);
  await page.getByRole("button", { name: "Refresh watched evidence" }).click();
  await expect(page.getByText("Pool liquidity fell below $100")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Market review" })).toBeVisible();
  await expect(page.getByText("Pool liquidity fell below $100")).toBeVisible();
});

for (const width of [390, 320]) test(`comparison stays usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/compare?assets=robinhood:AAPL,xstocks:NVDAx");
  await expect(page.getByRole("heading", { name: "Compare stock tokens" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Compare evidence" })).toBeVisible();
  await expect(page.getByText("Displayed pool liquidity does not estimate trade execution.").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `artifacts/compare-${width}.png`, fullPage: true });
});

test("data-saving preference keeps the film poster", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "connection", { value: { saveData: true } }));
  await page.route("**/media/stockscope-film.mp4", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".landing-film video source")).toHaveCount(0);
  await expect(page.locator(".landing-film-media")).toHaveCSS("background-image", /stockscope-poster.webp/);
  await expect(page.getByRole("link", { name: "Open terminal" }).first()).toBeVisible();
});

test("failed video leaves the poster and page content available", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/media/stockscope-film.mp4", (route) => route.abort());
  await page.goto("/");
  const failed = page.waitForEvent("requestfailed", (request) => request.url().endsWith("stockscope-film.mp4"));
  await page.locator(".landing-film").scrollIntoViewIfNeeded();
  await failed;
  await expect(page.locator(".landing-film video source")).toHaveCount(0);
  await expect(page.locator(".landing-film-media")).toHaveCSS("background-image", /stockscope-poster.webp/);
  await expect(page.getByRole("heading", { name: "Follow the evidence." })).toBeVisible();
});

test("first-party film plays when scrolled into view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.locator(".landing-film").scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator(".landing-film video").evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
});

test("landing preview links to the matching sourced asset", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Inspect record →" }).first().click();
  await expect(page).toHaveURL(/\/market\/aapl$/);
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible();
});

test("sourced terminal search, sorting, filters, links and demo separation", async ({ page }) => {
  await page.goto("/terminal");
  await expect(page.getByRole("heading", { name: "Stock Tokens", exact: true })).toBeVisible();
  await expect(page.locator(".sourced-row")).toHaveCount(3);
  await page.getByRole("textbox", { name: "Search Stock Tokens" }).fill("NVDA");
  await expect(page.locator(".sourced-row")).toHaveCount(1);
  await expect(page.locator(".sourced-row")).toContainText("NVDA");
  await expect(page).toHaveURL(/q=NVDA/);
  const contract = await page.locator(".contract-value").textContent();
  expect(contract).toMatch(/^0x[\da-f]{40}$/i);
  await page.getByRole("textbox", { name: "Search Stock Tokens" }).fill(contract!);
  await expect(page.locator(".sourced-row")).toHaveCount(1);
  await expect(page.locator(".sourced-row")).toContainText("NVDA");
  await page.getByRole("textbox", { name: "Search Stock Tokens" }).fill("no-such-asset");
  await expect(page.getByText("No matching instruments")).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await page.getByRole("button", { name: "Market", exact: true }).click();
  await expect(page.locator(".sourced-table thead")).toContainText("Issuer reference");
  await expect(page.locator(".sourced-table thead")).toContainText("Verified venue");
  await page.getByRole("combobox", { name: "Sort" }).selectOption("reference");
  await page.getByRole("button", { name: "Action", exact: true }).click();
  await expect(page.locator(".sourced-table thead")).toContainText("Action check");
  await page.goBack();
  await expect(page).toHaveURL(/view=market/);
  await expect(page.getByRole("button", { name: "Market", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Needs review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Needs review", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("textbox", { name: "Search Stock Tokens" }).fill("");
  await page.getByRole("button", { name: "Instrument", exact: true }).click();
  await page.getByRole("link", { name: /^AAPL/ }).click();
  await expect(page.getByRole("heading", { name: "Asset passport" })).toBeVisible();
  await expect(page.getByText("Token-equivalent reference bid / ask")).toBeVisible();
  const sectionNav = page.getByRole("navigation", { name: "Asset sections" });
  for (const section of ["Overview", "Markets", "Issuer", "Events", "Action"]) await expect(sectionNav.getByRole("link", { name: section, exact: true })).toBeVisible();
  await sectionNav.getByRole("link", { name: "Markets", exact: true }).click();
  await expect(page).toHaveURL(/#markets$/);
  await expect(page.locator("#markets")).toBeInViewport();
  await page.getByRole("link", { name: "Demo", exact: true }).click();
  await expect(page.locator(".demo-banner")).toBeVisible();
});

for (const width of [390, 320]) test(`demo table scroll stays inside the panel at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/demo");
  await expect(page.locator(".demo-banner")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const table = page.locator(".table-wrap");
  await table.scrollIntoViewIfNeeded();
  await table.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
  await expect(page.getByRole("link", { name: "View AAPLx details" })).toBeInViewport();
  await page.getByRole("link", { name: "View AAPLx details" }).click();
  await expect(page).toHaveURL(/\/assets\/aaplx$/);
});

for (const width of [1440, 390, 320]) test(`layout and keyboard controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/terminal");
  const search = page.getByRole("textbox", { name: "Search Stock Tokens" });
  await search.focus();
  await page.keyboard.type("TSLA");
  await expect(page.locator(".sourced-row")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "All", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `artifacts/terminal-${width}.png`, fullPage: true });
  await page.goto("/market/aapl");
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `artifacts/asset-${width}.png`, fullPage: true });
});

test("wallet rejection and unavailable analyst are explicit", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "ethereum", { value: { request: async () => { throw Object.assign(new Error("Rejected"), { code: 4001 }); } } });
  });
  await page.route("**/api/analyst", (route) => route.fulfill({ json: { state: "not_configured", message: "The analyst is not configured. Sourced evidence and policy checks remain available." } }));
  await page.goto("/market/aapl");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "wallet request was rejected" })).toBeVisible();
  await page.getByRole("button", { name: "Explain this evidence" }).click();
  await expect(page.getByText("The analyst is not configured. Sourced evidence and policy checks remain available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review in wallet and submit" })).toHaveCount(0);
});

test("unsupported execution and pending transaction recovery remain explicit", async ({ page }) => {
  const user = `0x${"1".repeat(40)}`;
  const hash = `0x${"2".repeat(64)}`;
  const evidenceHash = `0x${"3".repeat(64)}`;
  await page.addInitScript(({ user, hash, evidenceHash }) => {
    Object.defineProperty(window, "ethereum", { value: { request: async ({ method }: { method: string }) => method === "eth_chainId" ? "0x66eee" : [user] } });
    localStorage.setItem(`stockscope:trades:${user}`, JSON.stringify([{ hash, evidenceHash, state: "pending" }]));
  }, { user, hash, evidenceHash });
  await page.route("**/api/trade/prepare", (route) => route.fulfill({ json: {
    decision: { status: "review", checks: [{ code: "supported_route", status: "review", detail: "The route uses an unsupported hook." }], evidenceHash, expiresAt: null, version: 1 },
    quote: { state: "available", symbol: "AAPL", direction: "buy", sizeUsd: 5, inputAmount: "5000000", outputAmount: "10000000000000000", checkedAt: "2026-09-26T02:00:00Z" },
    approval: null, transaction: null, message: "Research quote available; guarded execution is unsupported.",
  } }));
  await page.route("**/api/trade/receipt", (route) => route.fulfill({ json: { state: "pending" } }));
  await page.goto("/market/aapl");
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByRole("button", { name: "Get estimate and review checks" }).click();
  await expect(page.getByRole("button", { name: "Review in wallet and submit" })).toBeDisabled();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(page.getByText("The route uses an unsupported hook.")).toBeVisible();
  await page.getByRole("button", { name: "Check transaction receipt" }).click();
  await expect(page.getByText("Transaction state: pending.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("heading", { name: "Saved transaction references" })).toBeVisible();
});
