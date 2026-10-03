import { BaseError, createPublicClient, encodeAbiParameters, http, keccak256, parseAbi, parseAbiParameters, parseAbiItem, type Hex } from "viem";
import { cachedSource } from "./source-cache";
import { parseXStock } from "./xstocks-catalog";
import { record } from "./observations";
import { getIdentity, usdgAddress } from "./robinhood-data";
import { robinhoodVenue, parseIndexedPairs, type VenuePair } from "./venue-market";
import { indexedJson } from "./indexed-provider";

export type CandleInterval = "15m" | "1h" | "1d";
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type CandleHistory = { state: "available" | "unavailable" | "stale"; reason: string | null; symbol: string; chainId: 42161 | 4663; contract: string | null; pool: string | null; interval: CandleInterval; candles: Candle[]; retrievedAt: string; lastTradeAt: string | null; unit: "USD per token"; volumeUnit: "USD"; gaps: number; finality: "Provider indexed; finality not guaranteed"; sourceUrl: string; incompleteFrom: number };
const manager = "0x360e68faccca8ca495c1b759fd9eee466db9fb32";
const usdc = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const initialization = parseAbiItem("event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)");
const steps: Record<CandleInterval, number> = { "15m": 900, "1h": 3600, "1d": 86400 };
const previous = new Map<string, CandleHistory>();

export function candleSourceError(error: unknown): string {
  if (error instanceof BaseError) return /timed out|timeout|too long/i.test(error.message)
    ? "Arbitrum verification timed out. Retry after one minute."
    : "Arbitrum verification source is unavailable. Retry after one minute.";
  if (error instanceof Error && /timed out|timeout|aborted/i.test(error.message)) return "Chart verification timed out. Retry after one minute.";
  if (error instanceof Error && error.message.length <= 180 && !/[\r\n]|https?:\/\//i.test(error.message)) return error.message;
  return "Chart source is unavailable. Retry after one minute.";
}

export function parseCandles(raw: unknown, interval: CandleInterval, now = Date.now()): { candles: Candle[]; gaps: number } {
  if (!Array.isArray(raw) || raw.length > 300) throw new Error("Invalid candle coverage");
  const candles: Candle[] = raw.map((row) => {
    if (!Array.isArray(row) || row.length !== 6 || row.some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new Error("Invalid candle units");
    const [time, open, high, low, close, volume] = row as number[];
    if (!Number.isInteger(time) || time % steps[interval] !== 0 || time * 1000 > now || Math.min(open, high, low, close) <= 0 || volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) throw new Error("Invalid candle values");
    return { time, open, high, low, close, volume };
  }).sort((a, b) => a.time - b.time);
  let gaps = 0;
  for (let index = 1; index < candles.length; index++) {
    if (candles[index].time === candles[index - 1].time) throw new Error("Duplicate candle observation");
    gaps += Math.max(0, (candles[index].time - candles[index - 1].time) / steps[interval] - 1);
  }
  return { candles, gaps };
}

export function poolKeyHash(currency0: string, currency1: string, fee: number, tickSpacing: number, hooks: string) {
  return keccak256(encodeAbiParameters(parseAbiParameters("address,address,uint24,int24,address"), [currency0 as Hex, currency1 as Hex, fee, tickSpacing, hooks as Hex]));
}

export function parseCandlePayload(payload: unknown, contract: string, interval: CandleInterval, now = Date.now(), quoteContract = usdc) {
  const data = record(payload);
  const base = record(record(data?.meta)?.base);
  const quote = record(record(data?.meta)?.quote);
  if (base?.address?.toString().toLowerCase() !== contract.toLowerCase()) throw new Error("Candle token identity mismatch.");
  if (quote?.address?.toString().toLowerCase() !== quoteContract.toLowerCase()) throw new Error("Candle quote identity mismatch.");
  const parsed = parseCandles(record(record(data?.data)?.attributes)?.ohlcv_list, interval, now);
  if (!parsed.candles.length) throw new Error("No indexed trades exist in this interval.");
  return parsed;
}

async function providerJson(path: string, fetcher: typeof fetch) {
  return (await indexedJson(path, fetcher)).payload;
}

async function verifiedPool(symbol: string, fetcher: typeof fetch) {
  return cachedSource(`candles:identity:${symbol}`, 3600, async () => {
    const issuerResponse = await fetcher(`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!issuerResponse.ok) throw new Error("Issuer identity unavailable.");
    const listing = parseXStock(await issuerResponse.json());
    if (!listing || listing.symbol !== symbol) throw new Error("Exact Arbitrum deployment is unavailable.");
    const pools = await providerJson(`/networks/arbitrum/tokens/${listing.contract}/pools?page=1`, fetcher);
    const candidates = Array.isArray(pools?.data) ? pools.data.map(record).filter((item) => record(record(item?.relationships)?.dex)?.data && record(record(record(item?.relationships)?.dex)?.data)?.id === "uniswap-v4-arbitrum") : [];
    const pool = candidates.find((item) => {
      const rel = record(item?.relationships);
      return record(record(rel?.base_token)?.data)?.id === `arbitrum_${listing.contract.toLowerCase()}` && record(record(rel?.quote_token)?.data)?.id === `arbitrum_${usdc}`;
    });
    const attrs = record(pool?.attributes);
    const id = attrs?.address;
    if (typeof id !== "string" || !/^0x[\da-f]{64}$/i.test(id) || typeof attrs?.pool_created_at !== "string") throw new Error(`No supported exact ${symbol}/USDC V4 pool is indexed.`);
    const created = Math.floor(Date.parse(attrs.pool_created_at) / 1000);
    if (!Number.isFinite(created)) throw new Error("Pool initialization time unavailable.");
    const client = createPublicClient({ transport: http(process.env.ARBITRUM_ONE_RPC_URL || "https://arb1.arbitrum.io/rpc", { timeout: 7000, retryCount: 0 }) });
    if (await client.getChainId() !== 42161) throw new Error("Wrong research RPC chain.");
    const token = listing.contract as Hex;
    const decimalsAbi = parseAbi(["function decimals() view returns (uint8)"]);
    const [code, decimals, quoteDecimals, managerCode, latest] = await Promise.all([client.getCode({ address: token }), client.readContract({ address: token, abi: decimalsAbi, functionName: "decimals" }), client.readContract({ address: usdc, abi: decimalsAbi, functionName: "decimals" }), client.getCode({ address: manager }), client.getBlockNumber()]);
    if (!code || code === "0x" || decimals !== 18 || quoteDecimals !== 6 || !managerCode || managerCode === "0x") throw new Error("Token unit or PoolManager verification failed.");
    let low = BigInt(0), high = latest;
    for (let count = 0; low < high && count < 40; count++) {
      const middle = (low + high) / BigInt(2);
      const block = await client.getBlock({ blockNumber: middle });
      if (Number(block.timestamp) < created) low = middle + BigInt(1); else high = middle;
    }
    const logs = await client.getLogs({ address: manager, event: initialization, args: { id: id as Hex }, fromBlock: low > BigInt(2000) ? low - BigInt(2000) : BigInt(0), toBlock: low + BigInt(2000) > latest ? latest : low + BigInt(2000) });
    const match = logs.find((log) => {
      const { currency0, currency1, fee, tickSpacing, hooks } = log.args;
      return currency0 && currency1 && fee !== undefined && tickSpacing !== undefined && hooks && [currency0.toLowerCase(), currency1.toLowerCase()].sort().join(":") === [token.toLowerCase(), usdc].sort().join(":") && poolKeyHash(currency0, currency1, fee, tickSpacing, hooks).toLowerCase() === id.toLowerCase();
    });
    if (!match) throw new Error("Pool initialization evidence could not be verified. No sample candles are substituted.");
    return { contract: listing.contract, pool: id, initializedBlock: match.blockNumber?.toString() };
  }, fetcher);
}

export async function xStockVenue(symbol: string, fetcher: typeof fetch = fetch) {
  const checkedAt = new Date().toISOString();
  try {
    const identity = await verifiedPool(symbol, fetcher);
    const snapshot = await indexedJson(`/networks/arbitrum/pools/${identity.pool}`, fetcher);
    const pairs = parseIndexedPairs(snapshot.payload, 42161, identity.contract, usdc, snapshot.retrievedAt, true).filter((pair) => pair.pairAddress.toLowerCase() === identity.pool.toLowerCase());
    return pairs.length ? { state: "available" as const, pairs, checkedAt } : { state: "unavailable" as const, pairs: [] as [], reason: "no_verified_pair", checkedAt };
  } catch {
    return { state: "unavailable" as const, pairs: [] as [], reason: "pool_verification_unavailable", checkedAt };
  }
}

async function robinhoodPool(symbol: string, expectedPool: string | undefined, fetcher: typeof fetch) {
  const identity = await getIdentity(symbol, fetcher);
  if (!("value" in identity)) throw new Error("Issuer identity unavailable.");
  const venues = await robinhoodVenue(identity.value.contract, fetcher);
  if (venues.state !== "available") throw new Error("No verified exact stock token/USDG pool is available.");
  const pair: VenuePair | undefined = expectedPool ? venues.pairs.find((item) => item.pairAddress.toLowerCase() === expectedPool.toLowerCase()) : venues.pairs[0];
  if (!pair) throw new Error("Requested instrument does not match the verified pool.");
  return { contract: identity.value.contract, pool: pair.pairAddress };
}

export async function candleHistory(symbol: string, interval: CandleInterval, expected: { contract?: string; pool?: string; issuer?: "robinhood" | "xstocks" } = {}, fetcher: typeof fetch = fetch): Promise<CandleHistory> {
  const robinhood = expected.issuer === "robinhood";
  const chainId = robinhood ? 4663 : 42161;
  const network = robinhood ? "robinhood" : "arbitrum";
  const key = `${chainId}:${symbol}:${interval}:${expected.contract || ""}:${expected.pool || ""}`;
  const empty: CandleHistory = { state: "unavailable", reason: null, symbol, interval, chainId, contract: null, pool: null, candles: [], retrievedAt: new Date().toISOString(), lastTradeAt: null, unit: "USD per token", volumeUnit: "USD", gaps: 0, finality: "Provider indexed; finality not guaranteed", sourceUrl: `https://www.geckoterminal.com/${network}`, incompleteFrom: Math.floor(Date.now() / 1000 / steps[interval]) * steps[interval] };
  try {
    const identity = robinhood ? await robinhoodPool(symbol, expected.pool, fetcher) : await verifiedPool(symbol, fetcher);
    if ((expected.contract && expected.contract.toLowerCase() !== identity.contract.toLowerCase()) || (expected.pool && expected.pool.toLowerCase() !== identity.pool.toLowerCase())) return { ...empty, reason: "Requested instrument does not match the verified pool." };
    const result = await cachedSource(`candles:${key}:${identity.contract}:${identity.pool}`, 60, async () => {
      const frame = interval === "15m" ? "minute" : interval === "1h" ? "hour" : "day";
      const observation = await indexedJson(`/networks/${network}/pools/${identity.pool}/ohlcv/${frame}?aggregate=${interval === "15m" ? 15 : 1}&limit=300&currency=usd&token=${identity.contract}&include_empty_intervals=false`, fetcher);
      const parsed = parseCandlePayload(observation.payload, identity.contract, interval, Date.now(), robinhood ? usdgAddress : usdc);
      return { ...empty, ...identity, ...parsed, retrievedAt: observation.retrievedAt, state: "available" as const, lastTradeAt: new Date(parsed.candles.at(-1)!.time * 1000).toISOString(), sourceUrl: `https://www.geckoterminal.com/${network}/pools/${identity.pool}` };
    }, fetcher);
    if (previous.size >= 64) previous.delete(previous.keys().next().value!);
    previous.set(key, result);
    return result;
  } catch (error) {
    const saved = previous.get(key);
    const reason = candleSourceError(error);
    const temporary = /rate limit|source is unavailable|fetch failed|timed out|aborted/i.test(reason);
    return temporary && saved && Date.now() - Date.parse(saved.retrievedAt) < 3600000 ? { ...saved, state: "stale", reason } : { ...empty, reason };
  }
}
