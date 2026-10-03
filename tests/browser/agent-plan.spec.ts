import { test, expect } from "@playwright/test";
import { buildReport } from "../../src/lib/agent-workflows";
import { sourcedAsset, contract } from "../source-fixtures";

for (const width of [1440, 390]) test(`AI draft review, exact handoff, wallet selection and manual edits at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state = window as Window & { ethereum?: unknown; walletCalls?: string[] };
    state.walletCalls = [];
    const wallet = (name: string) => ({ request: async ({ method }: { method: string }) => {
      state.walletCalls!.push(`${name}:${method}`);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return ["0xDC29c63a8E1e86eddBb7Cda1A8FA296B359e14dF"];
      if (method === "eth_chainId") return "0x66eee";
      throw new Error("Unexpected wallet signing request");
    }, on() {}, removeListener() {} });
    const metamask = wallet("MetaMask");
    const phantom = wallet("Phantom");
    state.ethereum = phantom;
    window.addEventListener("eip6963:requestProvider", () => {
      for (const [uuid, name, provider] of [["phantom", "Phantom", phantom], ["metamask", "MetaMask", metamask]]) window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid, name }, provider } }));
    });
  });
  const assetKey = `robinhood:4663:${contract}`;
  const report = buildReport(assetKey, sourcedAsset, { state: "unavailable", checkedAt: new Date().toISOString(), reason: "Browser fixture", pairs: [] }, "briefing");
  const id = `0x${"77".repeat(32)}`;
  const draft = { id, version: 1, assetKey, symbol: "AAPL", direction: "buy", amount: "5", inputUnit: "USDG", generatedAt: new Date().toISOString(), evidenceHash: report.evidenceHash, reportId: report.id, state: "unsigned", origin: "ai", rationale: "Issuer identity is cited [1]. Venue evidence is unavailable. Check the current policy before signing.", model: "provider-fixture", handoffUrl: `/market/AAPL?direction=buy&amount=5&proposalId=${id}#action` };
  let drafted = false;
  await page.route("**/api/agent/report**", (route) => route.fulfill({ json: { reports: [report], proposals: drafted ? [draft] : [] } }));
  await page.route("**/api/agent/plan", (route) => {
    expect(route.request().postDataJSON().request).toBe("Buy AAPL with 5 USDG");
    drafted = true;
    return route.fulfill({ json: { state: "available", proposal: draft } });
  });
  const checks: Record<string, unknown>[] = [];
  await page.route("**/api/trade/prepare", (route) => {
    checks.push(route.request().postDataJSON());
    return route.fulfill({ json: { decision: { status: "review", checks: [{ code: "deployment", status: "review", detail: "Testnet deployment unavailable" }], evidenceHash: report.evidenceHash, expiresAt: null, version: 1 }, quote: { state: "no_route", checkedAt: new Date().toISOString(), symbol: "AAPL", sizeUsd: 5 }, approval: null, transaction: null, message: "Testnet deployment unavailable. No transaction requested." } });
  });
  await page.goto("/market/AAPL");
  await page.getByRole("textbox", { name: "Trade request" }).fill("Buy AAPL with 5 USDG");
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toBeVisible();
  await expect(page.getByText("Buy AAPL using exactly 5 USDG")).toBeVisible();
  await page.getByRole("link", { name: "Review AI draft and check trade" }).click();
  await expect(page).toHaveURL(new RegExp(`proposalId=${id}`));
  await expect(page.locator("#trade-input")).toHaveValue("5");
  await expect(page.locator("#execution-wallet")).toHaveValue("metamask");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Get estimate and review checks" })).toBeEnabled();
  await page.getByRole("button", { name: "Get estimate and review checks" }).click();
  await expect(page.getByText("Testnet deployment unavailable. No transaction requested.")).toBeVisible();
  expect(checks[0].proposalId).toBe(id);
  expect(checks[0].inputAmount).toBe("5000000");
  await page.locator("#trade-input").fill("6");
  await page.getByRole("button", { name: "Get estimate and review checks" }).click();
  await expect.poll(() => checks.length).toBe(2);
  expect(checks[1].proposalId).toBeUndefined();
  await expect(page.getByRole("button", { name: "Review in wallet and submit" })).toBeDisabled();
  const calls = await page.evaluate(() => (window as Window & { walletCalls?: string[] }).walletCalls);
  expect(calls).toContain("MetaMask:eth_requestAccounts");
  expect(calls).not.toContain("Phantom:eth_requestAccounts");
  expect(calls?.some((call) => call.includes("eth_sendTransaction"))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("AI provider failure stays unavailable and cannot save a fake draft", async ({ page }) => {
  const assetKey = `robinhood:4663:${contract}`;
  const report = buildReport(assetKey, sourcedAsset, { state: "unavailable", checkedAt: new Date().toISOString(), reason: "Browser fixture", pairs: [] }, "briefing");
  await page.route("**/api/agent/report**", (route) => route.fulfill({ json: { reports: [report], proposals: [] } }));
  await page.route("**/api/agent/plan", (route) => route.fulfill({ json: { state: "provider_failed", message: "AI provider unavailable. No draft saved." } }));
  await page.goto("/market/AAPL");
  await page.getByRole("textbox", { name: "Trade request" }).fill("Buy AAPL with 5 USDG");
  await page.getByRole("button", { name: "Draft with AI" }).click();
  await expect(page.getByText("AI provider unavailable. No draft saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review your draft" })).toHaveCount(0);
});

test("mainnet wallets cannot enter the testnet signing flow", async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { ethereum?: unknown }).ethereum = { request: async ({ method }: { method: string }) => method === "eth_chainId" ? "0x1237" : ["0xDC29c63a8E1e86eddBb7Cda1A8FA296B359e14dF"], on() {}, removeListener() {} };
  });
  await page.goto("/market/AAPL");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByText("Use Arbitrum Sepolia (421614) or Robinhood testnet (46630). Mainnet signing is disabled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Get estimate and review checks" })).toBeDisabled();
});
