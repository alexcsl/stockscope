import { createPublicClient, http, parseAbi, parseUnits } from "viem";
import { address, record } from "./observations";
import { getVenuePairs, type VenueResult } from "./venue-market";
import { cachedSource } from "./source-cache";

const api = "https://api.xstocks.fi/api/v2/public/assets";
const usdc = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const rpc = process.env.ARBITRUM_ONE_RPC_URL || "https://arb1.arbitrum.io/rpc";
const abi = parseAbi(["function decimals() view returns (uint8)", "function getCurrentMultiplier() view returns (uint256)"]);

export interface XStockListing { symbol: string; name: string; underlying: string; contract: string; isin: string | null }
export interface XStockRecord extends XStockListing { state: "verified" | "unavailable"; reason?: string; multiplier: string | null; venue: VenueResult | null }
export type CatalogSnapshot = { assets: XStockListing[]; complete: boolean; retrievedAt: string; reason: string | null };

export async function discoverXStocks(fetcher: typeof fetch = fetch): Promise<CatalogSnapshot> {
  return cachedSource("xstocks:catalog", 300, async () => {
    const assets = new Map<string, XStockListing>();
    let complete = false;
    let reason: string | null = "Discovery limited to 2,000 provider records.";
    for (let page = 0; page < 20; page++) {
      const result = await listXStocks(page, fetcher);
      for (const asset of result.assets) assets.set(`${asset.symbol}:${asset.contract.toLowerCase()}`, asset);
      if (result.state === "error") { reason = "Some catalog pages could not load. Search covers the records shown."; break; }
      if (!result.hasNextPage) { complete = true; reason = null; break; }
    }
    return { assets: [...assets.values()], complete, reason, retrievedAt: new Date().toISOString() };
  }, fetcher);
}

export function parseXStock(raw: unknown): XStockListing | null {
  const asset = record(raw);
  const deployments = Array.isArray(asset?.deployments) ? asset.deployments.map(record) : [];
  const arbitrum = deployments.filter((item) => item?.network === "Arbitrum" && address(item.address));
  if (typeof asset?.symbol !== "string" || !/^[A-Za-z0-9]{1,15}x$/.test(asset.symbol) || typeof asset.name !== "string" || typeof asset.underlyingSymbol !== "string" || arbitrum.length !== 1 || record(asset.trading)?.currency !== "USD") return null;
  return { symbol: asset.symbol, name: asset.name, underlying: asset.underlyingSymbol, contract: arbitrum[0]!.address as string, isin: typeof asset.isin === "string" ? asset.isin : null };
}

export async function listXStocks(page: number, fetcher: typeof fetch = fetch): Promise<{ state: "available" | "error"; assets: XStockListing[]; page: number; hasNextPage: boolean }> {
  if (!Number.isInteger(page) || page < 0 || page > 1000) return { state: "error", assets: [], page, hasNextPage: false };
  try {
    const response = await fetcher(`${api}?page=${page}&pageSize=100`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("provider_unavailable");
    const data = record(await response.json());
    if (!Array.isArray(data?.nodes) || !record(data.page) || record(data.page)?.currentPage !== page) throw new Error("invalid_response");
    return { state: "available", assets: data.nodes.map(parseXStock).filter((asset): asset is XStockListing => asset !== null), page, hasNextPage: record(data.page)?.hasNextPage === true };
  } catch { return { state: "error", assets: [], page, hasNextPage: false }; }
}

export async function getXStock(symbol: string, fetcher: typeof fetch = fetch): Promise<XStockRecord | null> {
  if (!/^[A-Za-z0-9]{1,15}x$/.test(symbol)) return null;
  try {
    const [assetResponse, multiplierResponse] = await Promise.all([
      fetcher(`${api}/${encodeURIComponent(symbol)}`, { cache: "no-store", signal: AbortSignal.timeout(7000) }),
      fetcher(`${api}/${encodeURIComponent(symbol)}/multiplier?network=Arbitrum`, { cache: "no-store", signal: AbortSignal.timeout(7000) }),
    ]);
    if (!assetResponse.ok || !multiplierResponse.ok) throw new Error("issuer_unavailable");
    const listing = parseXStock(await assetResponse.json());
    if (!listing || listing.symbol !== symbol) return null;
    const multiplier = record(await multiplierResponse.json())?.currentMultiplier;
    const value = typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0 ? String(multiplier) : null;
    const result: XStockRecord = { ...listing, state: "unavailable", reason: "chain_verification_unavailable", multiplier: value, venue: null };
    if (!value) return { ...result, reason: "multiplier_unavailable" };
    const client = createPublicClient({ transport: http(rpc, { timeout: 7000, retryCount: 0 }) });
    if (await client.getChainId() !== 42161) return result;
    const blockNumber = await client.getBlockNumber();
    const contract = listing.contract as `0x${string}`;
    const [code, decimals, onchainMultiplier] = await Promise.all([
      client.getCode({ address: contract, blockNumber }),
      client.readContract({ address: contract, abi, functionName: "decimals", blockNumber }),
      client.readContract({ address: contract, abi, functionName: "getCurrentMultiplier", blockNumber }),
    ]);
    if (!code || code === "0x" || decimals !== 18 || onchainMultiplier !== parseUnits(value, 18)) return { ...result, reason: "identity_or_multiplier_mismatch" };
    return { ...result, state: "verified", reason: undefined, venue: await getVenuePairs(42161, contract, usdc, fetcher) };
  } catch { return null; }
}
