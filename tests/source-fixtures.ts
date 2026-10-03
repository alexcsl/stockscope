import type { SourcedAsset, IssuerIdentity } from "../src/lib/robinhood-data";
import type { PolicyEvidence } from "../src/lib/policy";

export const contract = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
export const identity: IssuerIdentity = { uid: `0x${"1".repeat(64)}`, symbol: "AAPL", name: "Apple", contract, chainId: 4663, decimals: 18, multiplier: "2", pendingMultiplier: null, isin: null, capabilities: null };
export const assetsResponse = { assets: [{ id: identity.uid, tokenSymbol: identity.symbol, tokenName: identity.name, tokenDecimals: 18, currentMultiplier: "2", pendingMultiplier: "", status: "ASSET_STATUS_ACTIVE", deployments: [{ chainId: 4663, contractAddress: contract }] }] };
export const now = "2026-09-26T02:00:00.000Z";
const source = { provider: "Fixture source", url: "https://example.com/source", observedAt: now, retrievedAt: now, scope: "Test only", unit: "USD" };
export const sourcedAsset: SourcedAsset = { symbol: "AAPL", identity: { state: "available", value: identity, source }, chain: { state: "available", value: { decimals: 18, multiplier: "2000000000000000000", oraclePaused: false, block: "10" }, source }, events: { state: "available", value: [], source }, price: { state: "available", value: { bid: "100", ask: "101", tokenBid: "200", tokenAsk: "202", currency: "USD", halted: false, underlyingVolume: null }, source } };
export function eligibleEvidence(): PolicyEvidence {
  return structuredClone({ version: 1, symbol: "AAPL", direction: "buy", inputAmount: "5000000", asset: sourcedAsset, quote: { state: "available", direction: "buy", symbol: "AAPL", sizeUsd: 5, inputAmount: "5000000", outputAmount: "25000000000000000", checkedAt: now, expiresAt: "2026-09-26T02:00:15.000Z", tokenAddress: contract, routing: "CLASSIC", pool: { protocol: 3, id: `0x${"2".repeat(64)}`, fee: 3000, tickSpacing: 0, hooks: `0x${"0".repeat(40)}` } }, evaluatedAt: now, executionConfigured: true, deploymentVerified: true, simulated: true, inputUsd18: "5000000000000000000", poolAllowed: true }) as PolicyEvidence;
}
