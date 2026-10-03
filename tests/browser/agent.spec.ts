import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`local evidence desk and unsigned handoff at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  if (width !== 1440) await page.emulateMedia({ reducedMotion: "reduce" });
  let reports: unknown[] = [];
  let proposals: unknown[] = [];
  await page.route("**/api/agent/report**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { reports, proposals } });
    const input = route.request().postDataJSON() as { symbol: string; assetKey: string; question?: string };
    const report = { id: "report-1", version: 1, kind: input.question ? "venue" : "briefing", assetKey: input.assetKey, symbol: input.symbol, generatedAt: "2026-09-29T00:00:00Z", evidenceHash: `0x${"1".repeat(64)}`, claims: [{ text: "Pool liquidity is reported in USD.", citations: [1] }], citations: [{ id: 1, label: "Verified venue", url: "https://dexscreener.com/robinhood/pair", state: "available", unit: "USD pool liquidity", observedAt: null, retrievedAt: "2026-09-29T00:00:00Z" }], unknowns: ["Source observation time is unknown."], model: null, promptVersion: null, usage: null };
    reports = [report];
    return route.fulfill({ json: report });
  });
  await page.route("**/api/agent/proposal", async (route) => {
    const input = route.request().postDataJSON() as { assetKey: string; direction: string; amount: string };
    const proposal = { id: "proposal-1", version: 1, assetKey: input.assetKey, symbol: "AAPL", direction: input.direction, amount: input.amount, inputUnit: "USDG", generatedAt: "2026-09-29T00:00:00Z", evidenceHash: `0x${"1".repeat(64)}`, reportId: "report-1", handoffUrl: `/market/AAPL?direction=${input.direction}&amount=${input.amount}#action`, state: "unsigned" };
    proposals = [proposal];
    return route.fulfill({ json: proposal });
  });
  await page.goto("/market/aapl");
  await expect(page.getByRole("heading", { name: "Evidence desk" })).toBeVisible();
  await page.getByRole("button", { name: "Create briefing" }).click();
  await expect(page.locator(".agent-report")).toContainText("Pool liquidity is reported in USD.");
  await page.getByRole("textbox", { name: "Asset question" }).fill("What is the venue liquidity?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.locator(".agent-report")).toContainText("Source observation time is unknown.");
  await page.locator("#proposal-amount").fill("7");
  await page.getByRole("button", { name: "Save trade plan" }).click();
  await page.getByRole("link", { name: "Continue to trade checks" }).click();
  await expect(page).toHaveURL(/direction=buy&amount=7#action/);
  await expect(page.locator("#trade-input")).toHaveValue("7");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("local monitor imports browser rules and shows in-app notices", async ({ page }) => {
  let rules: unknown[] = [];
  let alerts: unknown[] = [];
  await page.route("**/api/agent/monitor**", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { rules, alerts, observations: [], latest: {} } });
    const input = route.request().postDataJSON() as { action: string; rules?: unknown[] };
    if (input.action === "import") { rules = input.rules || []; return route.fulfill({ json: { imported: rules.length, total: rules.length } }); }
    alerts = [{ id: "notice-1", kind: "source_health", ruleId: null, ruleVersion: null, assetKey: "robinhood:4663:contract", message: "Source request failed for AAPL. Market alerts were not evaluated.", evidenceHash: `0x${"2".repeat(64)}`, currentId: `0x${"3".repeat(64)}`, evaluatedAt: "2026-09-29T00:00:00Z", evidenceUrl: null }];
    return route.fulfill({ json: { checked: 1, alerts: 1, errors: 1 } });
  });
  await page.goto("/terminal");
  await expect(page.getByRole("heading", { name: "Scheduled monitor" })).toBeVisible();
  await page.getByRole("button", { name: "AAPL Add" }).click();
  await page.getByRole("combobox", { name: "Alert asset" }).selectOption({ label: "AAPL" });
  await page.getByRole("spinbutton", { name: "Liquidity threshold in USD" }).fill("100");
  await page.getByRole("button", { name: "Add alert" }).click();
  await page.getByRole("button", { name: "Import browser alerts" }).click();
  await expect(page.locator(".operator-desk")).toContainText("AAPL · liquidity below");
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.locator(".operator-desk")).toContainText("Source request failed for AAPL");
  await page.reload();
  await expect(page.locator(".operator-desk")).toContainText("Source request failed for AAPL");
});
