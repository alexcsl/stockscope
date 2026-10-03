import { createHash } from "node:crypto";
import { parseUnits, type Hex } from "viem";
import type { SourcedAsset } from "./robinhood-data";
import type { UniswapRoute } from "./uniswap-route";

export interface PolicyCheck { code: string; status: "pass" | "review" | "fail"; detail: string }
export interface PolicyEvidence {
  version: 1;
  symbol: string;
  direction: "buy" | "sell";
  inputAmount: string;
  asset: SourcedAsset;
  quote: UniswapRoute;
  evaluatedAt: string;
  executionConfigured: boolean;
  deploymentVerified: boolean;
  simulated: boolean;
  inputUsd18: string | null;
  poolAllowed: boolean;
  testnet?: { chainId: number; demo?: { controller: string }; user: string; executor: string; executorCodeHash: Hex; stockToken: string; stablecoin: string; assetKey: string; sourceUrls: string[]; checks: PolicyCheck[] };
}
export interface PolicyDecision { status: "eligible" | "review" | "blocked"; checks: PolicyCheck[]; evidenceHash: Hex; expiresAt: string | null; version: 1 }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function hashEvidence(evidence: unknown): Hex { return `0x${createHash("sha256").update(canonical(evidence)).digest("hex")}`; }

export function evaluatePolicy(evidence: PolicyEvidence): PolicyDecision {
  if (evidence.testnet) {
    const checks = [...evidence.testnet.checks];
    const age = Date.parse(evidence.evaluatedAt) - Date.parse(evidence.quote.checkedAt);
    checks.push({ code: "testnet", status: [421614, 46630].includes(evidence.testnet.chainId) ? "pass" : "fail", detail: "Execution is restricted to Arbitrum Sepolia or Robinhood testnet." });
    checks.push({ code: "quote", status: evidence.quote.state === "available" && evidence.quote.direction === evidence.direction && evidence.quote.inputAmount === evidence.inputAmount && evidence.quote.tokenAddress?.toLowerCase() === evidence.testnet.stockToken.toLowerCase() && evidence.quote.stablecoinAddress?.toLowerCase() === evidence.testnet.stablecoin.toLowerCase() && age >= 0 && age <= 15000 && Date.parse(evidence.quote.expiresAt || "") > Date.parse(evidence.evaluatedAt) ? "pass" : "fail", detail: "Fresh exact-input testnet quote, separate from mainnet research prices." });
    checks.push({ code: "simulation", status: evidence.simulated ? "pass" : "review", detail: "The guarded executor must simulate with the connected wallet before signing." });
    return { status: checks.some((check) => check.status === "fail") ? "blocked" : checks.some((check) => check.status === "review") ? "review" : "eligible", checks, evidenceHash: hashEvidence(evidence), expiresAt: evidence.quote.expiresAt || null, version: 1 };
  }
  const { asset, quote } = evidence;
  const identity = "value" in asset.identity ? asset.identity.value : null;
  const events = "value" in asset.events ? asset.events.value : null;
  const now = Date.parse(evidence.evaluatedAt);
  const checks: PolicyCheck[] = [];
  const check = (code: string, passed: boolean, detail: string, unknown = false) => checks.push({ code, status: passed ? "pass" : unknown ? "review" : "fail", detail });
  check("identity", asset.identity.state === "available" && asset.chain.state === "available", "Issuer deployment, decimals, multiplier, and chain evidence must agree.", !identity || asset.chain.state !== "available");
  check("multiplier", Boolean(identity && !identity.pendingMultiplier && "value" in asset.chain && !asset.chain.value.oraclePaused), "No pending multiplier change or paused token oracle.", !identity);
  check("issuer_reference", asset.price.state === "available" && "value" in asset.price && !asset.price.value.halted && Boolean(asset.price.source.observedAt) && now - Date.parse(asset.price.source.observedAt || "") <= 60000 && now >= Date.parse(asset.price.source.observedAt || "") - 5000, "Fresh issuer observation and no reported halt.", !("value" in asset.price));
  check("corporate_actions", asset.events.state === "available" && events !== null && events.every((event) => event.status === "CORPORATE_ACTION_STATUS_COMPLETED"), "Unresolved or unknown issuer events require review.", !events || events.some((event) => event.status !== "CORPORATE_ACTION_STATUS_COMPLETED"));
  check("quote", quote.state === "available" && quote.direction === evidence.direction && quote.inputAmount === evidence.inputAmount && quote.symbol === evidence.symbol && quote.expiresAt !== undefined && Date.parse(quote.expiresAt) > now && now - Date.parse(quote.checkedAt) <= 15000 && now >= Date.parse(quote.checkedAt) && quote.tokenAddress?.toLowerCase() === identity?.contract.toLowerCase(), "Exact pair, direction, amount, and unexpired quote.", quote.state !== "available");
  check("supported_route", quote.routing === "CLASSIC" && Boolean(quote.pool) && evidence.poolAllowed, "Allowlisted single-pool V3 or V4 without hooks; no dynamic-fee or arbitrary routes.", !quote.pool);
  check("amount_limit", evidence.inputUsd18 !== null && /^\d+$/.test(evidence.inputUsd18) && BigInt(evidence.inputUsd18) > BigInt(0) && BigInt(evidence.inputUsd18) <= parseUnits("10", 18), "Fresh onchain oracle input valuation must not exceed $10.", evidence.inputUsd18 === null);
  check("deployment", evidence.executionConfigured && evidence.deploymentVerified, "Executor, adapters, signer, oracle bindings, and chain must be verified.", !evidence.executionConfigured || !evidence.deploymentVerified);
  check("simulation", evidence.simulated, "Current-state executor simulation must succeed before a wallet submission.", !evidence.simulated);
  return { status: checks.some((item) => item.status === "fail") ? "blocked" : checks.some((item) => item.status === "review") ? "review" : "eligible", checks, evidenceHash: hashEvidence(evidence), expiresAt: quote.expiresAt || null, version: 1 };
}
