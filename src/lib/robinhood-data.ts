import { createPublicClient, http, parseAbi, parseUnits, formatUnits } from "viem";
import { address, decimal, record, timestamp, type Observation, type Provenance } from "./observations";
import { cachedSource } from "./source-cache";

export const robinhoodChainId = 4663;
export const robinhoodSymbols = ["AAPL", "NVDA", "TSLA"] as const;
export const usdgAddress = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
export const robinhoodApi = "https://api.robinhood.com/rhj/";
export const robinhoodRpc = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

export interface IssuerIdentity {
  uid: string;
  symbol: string;
  name: string;
  contract: `0x${string}`;
  chainId: 4663;
  decimals: number;
  multiplier: string;
  pendingMultiplier: string | null;
  isin: string | null;
  capabilities: Record<string, unknown> | null;
}

export interface IssuerPrice {
  bid: string;
  ask: string;
  currency: "USD";
  halted: boolean;
  underlyingVolume: string | null;
  tokenBid: string;
  tokenAsk: string;
}

export interface IssuerEvent {
  id: string;
  type: string;
  status: string;
  processDate: string | null;
  details: Record<string, unknown>;
}

export interface ChainIdentity {
  decimals: number;
  multiplier: string;
  oraclePaused: boolean;
  block: string;
}

export interface SourcedAsset {
  symbol: string;
  identity: Observation<IssuerIdentity>;
  price: Observation<IssuerPrice>;
  events: Observation<IssuerEvent[]>;
  chain: Observation<ChainIdentity>;
}

function provenance(path: string, unit: string, retrievedAt: string, observedAt: string | null = null): Provenance {
  return { provider: "Robinhood", url: robinhoodApi + path, retrievedAt, observedAt, unit, scope: "Issuer-reported Stock Token data" };
}

async function json(path: string, ttl: number, fetcher: typeof fetch): Promise<{ value: unknown; retrievedAt: string }> {
  return cachedSource(path, ttl, async () => {
    const response = await fetcher(robinhoodApi + path, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error(response.status === 429 ? "rate_limited" : "upstream_unavailable");
    return { value: await response.json(), retrievedAt: new Date().toISOString() };
  }, fetcher);
}

export function parseIdentity(raw: unknown, symbol: string): IssuerIdentity | null {
  const assets = record(raw)?.assets;
  if (!Array.isArray(assets)) return null;
  const matches = assets.map(record).filter((item) => item?.tokenSymbol === symbol && item.status === "ASSET_STATUS_ACTIVE");
  if (matches.length !== 1) return null;
  const asset = matches[0]!;
  const deployments = Array.isArray(asset.deployments) ? asset.deployments.map(record).filter((item) => item?.chainId === robinhoodChainId) : [];
  if (deployments.length !== 1 || !address(deployments[0]?.contractAddress) || typeof asset.id !== "string" || !/^0x[\da-f]{64,66}$/i.test(asset.id) || typeof asset.tokenName !== "string" || asset.tokenDecimals !== 18 || !decimal(asset.currentMultiplier) || parseUnits(asset.currentMultiplier, 18) <= BigInt(0)) return null;
  if (asset.pendingMultiplier && !decimal(asset.pendingMultiplier)) return null;
  return { uid: asset.id, symbol, name: asset.tokenName, contract: deployments[0].contractAddress, chainId: 4663, decimals: 18, multiplier: asset.currentMultiplier, pendingMultiplier: asset.pendingMultiplier ? String(asset.pendingMultiplier) : null, isin: typeof asset.isin === "string" ? asset.isin : null, capabilities: record(asset.tradingCapabilities) };
}

export async function getIdentity(symbol: string, fetcher: typeof fetch = fetch): Promise<Observation<IssuerIdentity>> {
  const source = provenance("assets", "Token identity / shares per raw token", new Date().toISOString());
  try {
    const data = await json("assets", 60, fetcher);
    source.retrievedAt = data.retrievedAt;
    const value = parseIdentity(data.value, symbol);
    return value ? { state: "available", value, source } : { state: "unavailable", reason: "identity_unverified", source };
  } catch { return { state: "error", reason: "issuer_unavailable", source }; }
}

export function parsePrice(raw: unknown, identity: IssuerIdentity, retrievedAt: string, now = Date.now()): Observation<IssuerPrice> {
  const source = provenance(`prices/${identity.symbol}`, "USD per underlying share; token-equivalent values explicitly converted", retrievedAt);
  const quotes = record(raw)?.quotes;
  const matches = Array.isArray(quotes) ? quotes.map(record).filter((item) => item?.tokenSymbol === identity.symbol) : [];
  const quote = matches.length === 1 ? matches[0] : null;
  const deployments = Array.isArray(quote?.deployments) ? quote.deployments.map(record) : [];
  if (!quote || !deployments.some((item) => item?.chainId === 4663 && typeof item.contractAddress === "string" && item.contractAddress.toLowerCase() === identity.contract.toLowerCase()) || !decimal(quote.bid) || !decimal(quote.ask) || parseUnits(quote.bid, 18) <= BigInt(0) || parseUnits(quote.ask, 18) < parseUnits(quote.bid, 18) || quote.currency !== "USD" || typeof quote.isTradingHalt !== "boolean" || !timestamp(quote.generatedAt)) return { state: "error", reason: "invalid_price_response", source };
  source.observedAt = quote.generatedAt;
  const age = now - Date.parse(quote.generatedAt);
  const multiplier = parseUnits(identity.multiplier, 18);
  const convert = (value: string) => formatUnits(parseUnits(value, 18) * multiplier / BigInt(10) ** BigInt(18), 18);
  return { state: age > 60000 || age < -5000 ? "stale" : "available", reason: age > 60000 || age < -5000 ? "source_time_outside_window" : undefined, source, value: { bid: quote.bid, ask: quote.ask, currency: "USD", halted: quote.isTradingHalt, underlyingVolume: decimal(quote.dailyTradingVolume) && quote.dailyTradingVolume !== "0" ? quote.dailyTradingVolume : null, tokenBid: convert(quote.bid), tokenAsk: convert(quote.ask) } };
}

export function parseEvents(raw: unknown, identity: IssuerIdentity): IssuerEvent[] | null {
  const rows = record(raw)?.corpActions;
  if (!Array.isArray(rows)) return null;
  const selected = rows.map(record).filter((item) => item?.tokenSymbol === identity.symbol);
  const events: IssuerEvent[] = [];
  for (const item of selected) {
    if (!item || item.id !== identity.uid || typeof item.type !== "string" || typeof item.status !== "string" || !record(item.details) || !Array.isArray(item.deployments) || !item.deployments.map(record).some((deployment) => deployment?.chainId === 4663 && typeof deployment.contractAddress === "string" && deployment.contractAddress.toLowerCase() === identity.contract.toLowerCase())) return null;
    const date = record(item.processDate);
    const dateString = date && [date.year, date.month, date.day].every((x) => Number.isInteger(x)) && Number(date.year) >= 2000 && Number(date.month) >= 1 && Number(date.month) <= 12 && Number(date.day) >= 1 && Number(date.day) <= 31 && new Date(Date.UTC(Number(date.year), Number(date.month) - 1, Number(date.day))).getUTCDate() === date.day ? `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}` : null;
    events.push({ id: item.id, type: item.type, status: item.status, processDate: dateString, details: item.details as Record<string, unknown> });
  }
  return events;
}

export async function getChainIdentity(identity: IssuerIdentity): Promise<Observation<ChainIdentity>> {
  const source: Provenance = { provider: "Robinhood Chain RPC", url: "https://robinhoodchain.blockscout.com/token/" + identity.contract, observedAt: null, retrievedAt: new Date().toISOString(), unit: "ERC-20 decimals and 18-decimal multiplier", scope: "Exact contract at named block" };
  try {
    const client = createPublicClient({ transport: http(robinhoodRpc, { timeout: 7000, retryCount: 0 }) });
    if (await client.getChainId() !== 4663) throw new Error("wrong_chain");
    const block = await client.getBlockNumber();
    const abi = parseAbi(["function decimals() view returns (uint8)", "function uiMultiplier() view returns (uint256)", "function oraclePaused() view returns (bool)"]);
    const [code, decimals, multiplier, oraclePaused] = await Promise.all([
      client.getCode({ address: identity.contract, blockNumber: block }),
      client.readContract({ address: identity.contract, abi, functionName: "decimals", blockNumber: block }),
      client.readContract({ address: identity.contract, abi, functionName: "uiMultiplier", blockNumber: block }),
      client.readContract({ address: identity.contract, abi, functionName: "oraclePaused", blockNumber: block }),
    ]);
    source.retrievedAt = new Date().toISOString();
    if (!code || code === "0x" || decimals !== identity.decimals || multiplier !== parseUnits(identity.multiplier, 18)) return { state: "error", reason: "identity_or_multiplier_mismatch", source };
    return { state: "available", source, value: { decimals, multiplier: multiplier.toString(), oraclePaused, block: block.toString() } };
  } catch { return { state: "unavailable", reason: "chain_verification_unavailable", source }; }
}

export async function getSourcedAsset(symbol: string, fetcher: typeof fetch = fetch): Promise<SourcedAsset> {
  const identity = await getIdentity(symbol, fetcher);
  const source = provenance("assets", "Unknown", new Date().toISOString());
  if (!("value" in identity)) return { symbol, identity, price: { state: "unavailable", reason: "identity_unverified", source }, events: { state: "unavailable", reason: "identity_unverified", source }, chain: { state: "unavailable", reason: "identity_unverified", source } };
  const asset = identity.value;
  const [price, events, chain] = await Promise.all([
    json(`prices/${symbol}`, 15, fetcher).then((data) => parsePrice(data.value, asset, data.retrievedAt)).catch(() => ({ state: "error" as const, reason: "price_unavailable", source: provenance(`prices/${symbol}`, "USD per underlying share", new Date().toISOString()) })),
    json("corporate-actions", 3600, fetcher).then((data): Observation<IssuerEvent[]> => {
      const source = provenance("corporate-actions", "Issuer process date and event details", data.retrievedAt);
      const value = parseEvents(data.value, asset);
      return value ? { state: "available", value, source } : { state: "error", reason: "invalid_event_response", source };
    }).catch(() => ({ state: "error" as const, reason: "events_unavailable", source: provenance("corporate-actions", "Issuer events", new Date().toISOString()) })),
    cachedSource(`chain:${asset.contract}:${asset.multiplier}`, 15, () => getChainIdentity(asset), fetcher),
  ]);
  return { symbol, identity, price, events, chain };
}

export async function listSourcedAssets() {
  return Promise.all(robinhoodSymbols.map((symbol) => getSourcedAsset(symbol)));
}
