import { createPublicClient, http, parseAbi } from "viem";
import { address, record } from "./observations";
import { cachedSource } from "./source-cache";
import { robinhoodRpc, usdgAddress } from "./robinhood-data";
import { indexedJson } from "./indexed-provider";

const pairApi = "https://api.dexscreener.com/token-pairs/v1";
const poolAbi = parseAbi(["function token0() view returns (address)", "function token1() view returns (address)"]);

export interface VenuePair {
  chainId: number;
  contract: string;
  pairAddress: string;
  dex: string;
  baseSymbol: string;
  quoteSymbol: string;
  quoteContract: string;
  createdAt: string | null;
  liquidityUsd: string | null;
  priceUsd?: string | null;
  windows: { window: "m5" | "h1" | "h6" | "h24"; buys: number | null; sells: number | null; buyers?: number | null; sellers?: number | null; volumeUsd: string | null; changePercent?: number | null }[];
  retrievedAt: string;
  sourceUrl: string;
  sourceObservedAt: null;
}

export type VenueResult = { state: "available"; pairs: VenuePair[]; checkedAt: string } | { state: "unavailable" | "error"; reason: string; pairs: []; checkedAt: string };

function nonnegative(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? String(value) : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function numeric(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || (typeof value === "string" && !/^-?\d+(\.\d+)?$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function amount(value: unknown): string | null {
  const number = numeric(value);
  return number !== null && number >= 0 ? String(number) : null;
}

export function parseIndexedPairs(payload: unknown, chainId: 4663 | 42161, contract: string, quote: string, retrievedAt: string, includeV4 = false): VenuePair[] {
  const root = record(payload);
  const rows = Array.isArray(root?.data) ? root.data : root?.data ? [root.data] : [];
  const network = chainId === 4663 ? "robinhood" : "arbitrum";
  return rows.flatMap((row): VenuePair[] => {
    const item = record(row), attrs = record(item?.attributes), rel = record(item?.relationships);
    const dex = record(record(rel?.dex)?.data)?.id;
    const v4 = dex === `uniswap-v4-${network}`;
    if (dex !== `uniswap-v3-${network}` && !(includeV4 && v4)) return [];
    if (record(record(rel?.base_token)?.data)?.id !== `${network}_${contract.toLowerCase()}` || record(record(rel?.quote_token)?.data)?.id !== `${network}_${quote.toLowerCase()}`) return [];
    const pool = attrs?.address;
    if (typeof pool !== "string" || !(v4 ? /^0x[\da-f]{64}$/i : /^0x[\da-f]{40}$/i).test(pool)) return [];
    const created = typeof attrs?.pool_created_at === "string" ? Date.parse(attrs.pool_created_at) : NaN;
    const symbols = typeof attrs?.name === "string" ? attrs.name.split(" / ") : [];
    return [{ chainId, contract, pairAddress: pool, dex: v4 ? "Uniswap V4" : "Uniswap V3", baseSymbol: symbols[0] || "Token", quoteSymbol: quote.toLowerCase() === usdgAddress.toLowerCase() ? "USDG" : "USDC", quoteContract: quote, createdAt: Number.isFinite(created) && created > 0 && created <= Date.parse(retrievedAt) ? new Date(created).toISOString() : null, liquidityUsd: amount(attrs?.reserve_in_usd), priceUsd: amount(attrs?.base_token_price_usd), windows: (["h1", "h24", "m5", "h6"] as const).map((window) => {
      const txns = record(record(attrs?.transactions)?.[window]);
      return { window, buys: count(txns?.buys), sells: count(txns?.sells), buyers: count(txns?.buyers), sellers: count(txns?.sellers), volumeUsd: amount(record(attrs?.volume_usd)?.[window]), changePercent: numeric(record(attrs?.price_change_percentage)?.[window]) };
    }), retrievedAt, sourceUrl: `https://www.geckoterminal.com/${network}/pools/${pool}`, sourceObservedAt: null }];
  });
}

export function parseVenuePairs(raw: unknown, chainId: number, contract: string, quote: string, retrievedAt: string): VenuePair[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): VenuePair[] => {
    const pair = record(item);
    const base = record(pair?.baseToken);
    const quoteToken = record(pair?.quoteToken);
    if (pair?.chainId !== (chainId === 4663 ? "robinhood" : "arbitrum") || pair.dexId !== "uniswap" || !Array.isArray(pair.labels) || !pair.labels.includes("v3") || !address(pair.pairAddress) || !address(base?.address) || !address(quoteToken?.address) || base.address.toLowerCase() !== contract.toLowerCase() || quoteToken.address.toLowerCase() !== quote.toLowerCase()) return [];
    const createdAt = typeof pair.pairCreatedAt === "number" && Number.isSafeInteger(pair.pairCreatedAt) && pair.pairCreatedAt > 0 && pair.pairCreatedAt <= Date.parse(retrievedAt) ? new Date(pair.pairCreatedAt).toISOString() : null;
    const txns = record(pair.txns);
    const volume = record(pair.volume);
    const priceUsd = amount(pair.priceUsd);
    const changes = record(pair.priceChange);
    return [{ chainId, contract, pairAddress: pair.pairAddress, dex: "Uniswap V3", baseSymbol: typeof base.symbol === "string" ? base.symbol : "Token", quoteSymbol: typeof quoteToken.symbol === "string" ? quoteToken.symbol : "Quote", quoteContract: quote, createdAt, liquidityUsd: nonnegative(record(pair.liquidity)?.usd), priceUsd, windows: (["h1", "h24", "m5", "h6"] as const).map((window) => ({ window, buys: count(record(txns?.[window])?.buys), sells: count(record(txns?.[window])?.sells), volumeUsd: nonnegative(volume?.[window]), changePercent: numeric(changes?.[window]) })), retrievedAt, sourceUrl: typeof pair.url === "string" && pair.url.startsWith("https://dexscreener.com/") ? pair.url : `https://dexscreener.com/${chainId === 4663 ? "robinhood" : "arbitrum"}/${pair.pairAddress}`, sourceObservedAt: null }];
  });
}

export async function getVenuePairs(chainId: 4663 | 42161, contract: string, quote: string, fetcher: typeof fetch = fetch): Promise<VenueResult> {
  const checkedAt = new Date().toISOString();
  if (!address(contract) || !address(quote)) return { state: "unavailable", reason: "identity_unverified", pairs: [], checkedAt };
  try {
    const chain = chainId === 4663 ? "robinhood" : "arbitrum";
    const observations = await Promise.allSettled([cachedSource(`venue:${chain}:${contract}`, 60, async () => {
      const response = await fetcher(`${pairApi}/${chain}/${contract}`, { cache: "no-store", signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(response.status === 429 ? "rate_limited" : "provider_unavailable");
      const value: unknown = await response.json();
      if (!Array.isArray(value)) throw new Error("invalid_response");
      return { value, retrievedAt: new Date().toISOString() };
    }, fetcher), indexedJson(`/networks/${chain}/tokens/${contract.toLowerCase()}/pools?page=1`, fetcher)]);
    const candidatesByPool = new Map<string, VenuePair>();
    const screener = observations[0], indexed = observations[1];
    if (screener.status === "fulfilled") for (const pair of parseVenuePairs(screener.value.value, chainId, contract, quote, screener.value.retrievedAt)) candidatesByPool.set(pair.pairAddress.toLowerCase(), pair);
    if (indexed.status === "fulfilled") for (const pair of parseIndexedPairs(indexed.value.payload, chainId, contract, quote, indexed.value.retrievedAt)) candidatesByPool.set(pair.pairAddress.toLowerCase(), pair);
    if (observations.every((result) => result.status === "rejected")) throw new Error("provider_unavailable");
    const candidates = [...candidatesByPool.values()].sort((a, b) => Number(b.liquidityUsd || 0) - Number(a.liquidityUsd || 0));
    if (!candidates.length) return { state: "unavailable", reason: "no_verified_pair", pairs: [], checkedAt };
    const client = createPublicClient({ transport: http(chainId === 4663 ? robinhoodRpc : process.env.ARBITRUM_ONE_RPC_URL || "https://arb1.arbitrum.io/rpc", { timeout: 7000, retryCount: 0 }) });
    if (await client.getChainId() !== chainId) throw new Error("wrong_chain");
    const blockNumber = await client.getBlockNumber();
    const verified = await Promise.all(candidates.slice(0, 12).map(async (pair) => {
      try {
        const pool = pair.pairAddress as `0x${string}`;
        const [code, token0, token1] = await Promise.all([
          client.getCode({ address: pool, blockNumber }),
          client.readContract({ address: pool, abi: poolAbi, functionName: "token0", blockNumber }),
          client.readContract({ address: pool, abi: poolAbi, functionName: "token1", blockNumber }),
        ]);
        return code && code !== "0x" && [token0.toLowerCase(), token1.toLowerCase()].sort().join(":") === [contract.toLowerCase(), quote.toLowerCase()].sort().join(":") ? pair : null;
      } catch { return null; }
    }));
    const pairs = verified.filter((pair): pair is VenuePair => pair !== null).sort((a, b) => Number(b.liquidityUsd || 0) - Number(a.liquidityUsd || 0));
    return pairs.length ? { state: "available", pairs, checkedAt } : { state: "unavailable", reason: "pool_verification_unavailable", pairs: [], checkedAt };
  } catch (error) {
    return { state: "error", reason: error instanceof Error && error.message === "rate_limited" ? "rate_limited" : "provider_unavailable", pairs: [], checkedAt };
  }
}

export function robinhoodVenue(contract: string, fetcher: typeof fetch = fetch) {
  return getVenuePairs(4663, contract, usdgAddress, fetcher);
}
