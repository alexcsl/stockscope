import { getIdentity } from "./robinhood-data";
import { cachedSource } from "./source-cache";
import { encodeAbiParameters, keccak256, pad, type Hex } from "viem";

const robinhoodRpcUrl = "https://rpc.mainnet.chain.robinhood.com";
const uniswapQuoteUrl = "https://trade-api.gateway.uniswap.org/v1/quote";
const usdgAddress = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const chainId = 4663;
const supportedSymbols = ["AAPL", "NVDA", "TSLA"] as const;
const sizes = [1, 5, 10, 100, 1000, 10000] as const;

export type UniswapRouteState =
  | "available"
  | "not_configured"
  | "wallet_required"
  | "identity_unavailable"
  | "no_route"
  | "amount_too_low"
  | "unsupported_token"
  | "auth_failed"
  | "access_denied"
  | "request_rejected"
  | "rate_limited"
  | "upstream_unavailable"
  | "invalid_response";

export interface UniswapRoute {
  state: UniswapRouteState;
  checkedAt: string;
  sizeUsd: number;
  symbol: string;
  expiresAt?: string;
  direction?: "buy" | "sell";
  tokenAddress?: string;
  stablecoinAddress?: string;
  inputAmount?: string;
  outputAmount?: string;
  routing?: string;
  pool?: { protocol: 3 | 4; id: Hex; fee: number; tickSpacing: number; hooks: string };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveInteger(value: unknown): value is string {
  return typeof value === "string" && value.length <= 78 && /^[1-9]\d*$/.test(value) && BigInt(value) <= BigInt(2) ** BigInt(256) - BigInt(1);
}

function validAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function rpc(fetcher: typeof fetch, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetcher(robinhoodRpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  return record(await response.json())?.result;
}

async function readDecimals(address: string, fetcher: typeof fetch): Promise<number | null> {
  try {
    const [code, rawDecimals] = await Promise.all([
      rpc(fetcher, "eth_getCode", [address, "latest"]),
      rpc(fetcher, "eth_call", [{ to: address, data: "0x313ce567" }, "latest"]),
    ]);
    if (typeof code !== "string" || code === "0x" || typeof rawDecimals !== "string" || !/^0x[\da-fA-F]{1,64}$/.test(rawDecimals)) return null;
    const decimals = Number(BigInt(rawDecimals));
    return Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 ? decimals : null;
  } catch {
    return null;
  }
}

async function resolveToken(symbol: string, fetcher: typeof fetch): Promise<{ address: string; decimals: number } | null> {
  const identity = await getIdentity(symbol, fetcher);
  return "value" in identity ? { address: identity.value.contract, decimals: identity.value.decimals } : null;
}

export function readQuote(raw: unknown, tokenAddress: string, sellAmount: string, direction: "buy" | "sell" = "buy"): Pick<UniswapRoute, "state" | "inputAmount" | "outputAmount" | "routing" | "pool"> {
  const payload = record(raw);
  const quote = record(payload?.quote);
  const input = record(quote?.input);
  const output = record(quote?.output);
  if (!input || !output) return { state: "invalid_response" };
  if (
    typeof input.token !== "string" || input.token.toLowerCase() !== (direction === "buy" ? usdgAddress : tokenAddress).toLowerCase() ||
    typeof output.token !== "string" || output.token.toLowerCase() !== (direction === "buy" ? tokenAddress : usdgAddress).toLowerCase() ||
    (input.chainId !== undefined && input.chainId !== chainId) || (output.chainId !== undefined && output.chainId !== chainId) ||
    input.amount !== sellAmount || !positiveInteger(output.amount) ||
    typeof payload?.routing !== "string" || !["CLASSIC", "DUTCH_V2", "DUTCH_V3", "PRIORITY"].includes(payload.routing)
  ) return { state: "invalid_response" };
  let pool: UniswapRoute["pool"];
  const routes = quote?.route;
  if (Array.isArray(routes) && routes.length === 1 && Array.isArray(routes[0]) && routes[0].length === 1) {
    const hop = record(routes[0][0]);
    const tokenIn = record(hop?.tokenIn);
    const tokenOut = record(hop?.tokenOut);
    const fee = typeof hop?.fee === "string" && /^\d+$/.test(hop.fee) ? Number(hop.fee) : NaN;
    const tickSpacing = typeof hop?.tickSpacing === "string" && /^\d+$/.test(hop.tickSpacing) ? Number(hop.tickSpacing) : 0;
    if (tokenIn?.chainId === 4663 && tokenOut?.chainId === 4663 && typeof tokenIn.address === "string" && typeof tokenOut.address === "string" && tokenIn.address.toLowerCase() === input.token.toLowerCase() && tokenOut.address.toLowerCase() === output.token.toLowerCase() && hop?.amountIn === sellAmount && hop.amountOut === output.amount && Number.isInteger(fee) && fee >= 0 && fee < 1_000_000) {
      if (hop.type === "v3-pool" && validAddress(hop.address)) pool = { protocol: 3, id: pad(hop.address as Hex), fee, tickSpacing: 0, hooks: "0x0000000000000000000000000000000000000000" };
      if (hop.type === "v4-pool" && hop.hooks === "0x0000000000000000000000000000000000000000" && tickSpacing > 0 && tickSpacing <= 32767) {
        const tokens = [input.token, output.token].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())) as [Hex, Hex];
        const id = keccak256(encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }], [tokens[0], tokens[1], fee, tickSpacing, "0x0000000000000000000000000000000000000000"]));
        if (typeof hop.address === "string" && id.toLowerCase() === hop.address.toLowerCase()) pool = { protocol: 4, id, fee, tickSpacing, hooks: hop.hooks };
      }
    }
  }
  return { state: "available", inputAmount: input.amount, outputAmount: output.amount, routing: payload.routing, pool };
}

export async function getUniswapRoute(
  symbol: string,
  sizeUsd: number,
  swapper: string,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  trade?: { direction: "buy" | "sell"; inputAmount: string; protocols: ("V3" | "V4")[] },
): Promise<UniswapRoute> {
  const base = { get checkedAt() { return now().toISOString(); }, sizeUsd, symbol, direction: trade?.direction || "buy" as const };
  if (!(supportedSymbols as readonly string[]).includes(symbol) || (trade?.direction === "sell" ? sizeUsd !== 0 : !(sizes as readonly number[]).includes(sizeUsd))) {
    return { ...base, state: "request_rejected" };
  }
  if (!apiKey) return { ...base, state: "not_configured" };
  if (!validAddress(swapper)) return { ...base, state: "wallet_required" };
  if (trade && (!positiveInteger(trade.inputAmount) || trade.inputAmount.length > 30 || !["buy", "sell"].includes(trade.direction))) return { ...base, state: "request_rejected" };

  const token = await resolveToken(symbol, fetcher);
  if (!token) return { ...base, state: "identity_unavailable" };
  const [stablecoinDecimals, tokenDecimals] = await Promise.all([
    cachedSource("decimals:usdg", 60, () => readDecimals(usdgAddress, fetcher), fetcher),
    cachedSource(`decimals:${token.address}`, 60, () => readDecimals(token.address, fetcher), fetcher),
  ]);
  if (stablecoinDecimals !== 6 || tokenDecimals !== token.decimals) return { ...base, state: "identity_unavailable" };

  const sellAmount = trade?.inputAmount || String(BigInt(sizeUsd) * BigInt(1_000_000));
  const direction = trade?.direction || "buy";
  try {
    const response = await fetcher(uniswapQuoteUrl, {
      method: "POST",
      headers: { "x-api-key": apiKey, accept: "application/json", "content-type": "application/json", "x-universal-router-version": "2.1.2" },
      body: JSON.stringify({
        type: "EXACT_INPUT",
        amount: sellAmount,
        tokenInChainId: chainId,
        tokenOutChainId: chainId,
        tokenIn: direction === "buy" ? usdgAddress : token.address,
        tokenOut: direction === "buy" ? token.address : usdgAddress,
        swapper,
        autoSlippage: "DEFAULT",
        routingPreference: "BEST_PRICE",
        protocols: trade?.protocols || ["V2", "V3", "V4"],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) return { ...base, state: "auth_failed" };
    if (response.status === 403) return { ...base, state: "access_denied" };
    if (response.status === 429) return { ...base, state: "rate_limited" };
    if (response.status === 404) {
      const code = record(await response.json().catch(() => null))?.errorCode;
      if (code === "NoRouteFoundError") return { ...base, state: "no_route" };
      if (code === "QuoteAmountTooLowError") return { ...base, state: "amount_too_low" };
      if (code === "UnsupportedTokenError") return { ...base, state: "unsupported_token" };
      return { ...base, state: "upstream_unavailable" };
    }
    if (response.status === 400 || response.status === 422) return { ...base, state: "request_rejected" };
    if (!response.ok) return { ...base, state: "upstream_unavailable" };
    const parsed = readQuote(await response.json(), token.address, sellAmount, direction);
    const checkedAt = now().toISOString();
    return { ...base, checkedAt, expiresAt: new Date(Date.parse(checkedAt) + 15000).toISOString(), tokenAddress: token.address, stablecoinAddress: usdgAddress, ...parsed };
  } catch {
    return { ...base, state: "upstream_unavailable" };
  }
}
