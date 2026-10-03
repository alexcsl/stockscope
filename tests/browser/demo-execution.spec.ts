import { test, expect } from "@playwright/test";

const owner = `0x${"1".repeat(40)}`;
const controller = `0x${"2".repeat(40)}`;
const executor = `0x${"3".repeat(40)}`;

for (const width of [1440, 390, 320]) test(`demo attribution and unfunded wallet at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const state = window as Window & { ethereum?: unknown; walletCalls?: string[] };
    state.walletCalls = [];
    state.ethereum = { request: async ({ method }: { method: string }) => {
      state.walletCalls!.push(method);
      if (method === "eth_chainId") return "0x66eee";
      if (method === "eth_requestAccounts") return [`0x${"4".repeat(40)}`];
      throw new Error("Unexpected signing request");
    }, on() {}, removeListener() {} };
  });
  await page.route("**/api/execution/status", (route) => route.fulfill({ json: { state: "ready", message: "Demo contracts are active. Each trade still needs a fresh safety check and wallet approval.", chainId: 421614, owner, controller, executor, explorer: "https://sepolia.arbiscan.io", symbols: ["AAPL"] } }));
  await page.route("**/api/trade/prepare", (route) => route.fulfill({ json: { network: { chainId: 421614, explorer: "https://sepolia.arbiscan.io", testnet: true, demo: { controller }, stockToken: controller, stablecoin: executor }, decision: { status: "blocked", checks: [], evidenceHash: `0x${"5".repeat(64)}`, expiresAt: null }, quote: { state: "no_route", checkedAt: new Date().toISOString() }, approval: null, transaction: null, message: "This wallet does not have enough demo tokens. The deployment owner can transfer test tokens to it. No spending approval is available." } }));
  await page.goto("/market/AAPL");
  await expect(page.getByText("Arbitrum Sepolia demo", { exact: true })).toBeVisible();
  await expect(page.getByText(/DEMO-AAPL and DEMO-USDG have no monetary value/)).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: "Get estimate and review checks", exact: true }).click();
  await expect(page.getByText(/This wallet does not have enough demo tokens/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve this amount", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review in wallet and submit", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review demo feed refresh in wallet", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { walletCalls?: string[] }).walletCalls)).not.toContain("eth_sendTransaction");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("unverified demo status provides no refresh or explorer target", async ({ page }) => {
  await page.route("**/api/execution/status", (route) => route.fulfill({ json: { state: "unavailable", message: "Demo contract status could not be verified. Trading stays unavailable until its safety checks pass." } }));
  await page.goto("/market/AAPL");
  await expect(page.getByText(/Demo contract status could not be verified/)).toBeVisible();
  await expect(page.getByRole("link", { name: "View executor on explorer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review demo feed refresh in wallet" })).toHaveCount(0);
});

test("owner feed refresh stops if the wallet changes to mainnet", async ({ page }) => {
  await page.addInitScript(() => {
    let connections = 0;
    const state = window as Window & { ethereum?: unknown; signed?: boolean };
    state.signed = false;
    state.ethereum = { request: async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") { connections++; return [`0x${"1".repeat(40)}`]; }
      if (method === "eth_chainId") return connections >= 2 ? "0x1" : "0x66eee";
      if (method === "eth_sendTransaction") { state.signed = true; throw new Error("Unexpected transaction"); }
      throw new Error("Unexpected wallet method");
    }, on() {}, removeListener() {} };
  });
  await page.route("**/api/execution/status", (route) => route.fulfill({ json: { state: "stale", message: "Demo price checks expired. The owner can refresh the fixed test feeds.", chainId: 421614, owner, controller, executor, explorer: "https://sepolia.arbiscan.io", symbols: ["AAPL"] } }));
  await page.goto("/market/AAPL");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: "Review demo feed refresh in wallet", exact: true }).click();
  await expect(page.getByText("Wallet network changed. Reconnect on Arbitrum Sepolia.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { signed?: boolean }).signed)).toBe(false);
});
