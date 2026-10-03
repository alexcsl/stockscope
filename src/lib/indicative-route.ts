import { getIssuerPilot } from "@/lib/issuer-data";

const rpcUrl = "https://arb1.arbitrum.io/rpc";
const priceUrl = "https://api.0x.org/swap/allowance-holder/price";
const usdcAddress = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const sizes = [100, 1000, 10000] as const;

export type RouteState = "available" | "not_configured" | "identity_unavailable" | "no_route" | "rwa_access_required" | "auth_failed" | "access_denied" | "request_rejected" | "rate_limited" | "upstream_unavailable" | "invalid_response";

export interface IndicativeRoute {
  state: RouteState;
  checkedAt: string;
  sizeUsd: number;
  buyAmount?: string;
  sellAmount?: string;
  sources?: string[];
  tokenAddress?: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveIntegerString(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

export function parsePrice(raw: unknown, buyToken: string, sellToken: string): Pick<IndicativeRoute, "state" | "buyAmount" | "sellAmount" | "sources"> {
  const price = object(raw);
  if (!price) return { state: "invalid_response" };
  if (price.liquidityAvailable === false) return { state: "no_route" };
  if (
    price.liquidityAvailable !== true ||
    typeof price.buyToken !== "string" || price.buyToken.toLowerCase() !== buyToken.toLowerCase() ||
    typeof price.sellToken !== "string" || price.sellToken.toLowerCase() !== sellToken.toLowerCase() ||
    !positiveIntegerString(price.buyAmount) || !positiveIntegerString(price.sellAmount)
  ) return { state: "invalid_response" };

  const fills = object(price.route)?.fills;
  const sources = Array.isArray(fills)
    ? [...new Set(fills.map((fill) => object(fill)?.source).filter((source): source is string => typeof source === "string" && source.length > 0))]
    : [];
  return { state: "available", buyAmount: price.buyAmount, sellAmount: price.sellAmount, sources };
}

async function readContract(address: string, fetcher: typeof fetch): Promise<number | null> {
  async function rpc(method: string, params: unknown[]) {
    const response = await fetcher(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return object(await response.json())?.result;
  }

  try {
    const [code, decimals] = await Promise.all([
      rpc("eth_getCode", [address, "latest"]),
      rpc("eth_call", [{ to: address, data: "0x313ce567" }, "latest"]),
    ]);
    if (typeof code !== "string" || code === "0x" || typeof decimals !== "string" || !/^0x[0-9a-fA-F]+$/.test(decimals)) return null;
    const value = Number(BigInt(decimals));
    return Number.isInteger(value) && value >= 0 && value <= 36 ? value : null;
  } catch {
    return null;
  }
}

export async function getIndicativeRoute(sizeUsd: number, apiKey: string | undefined, fetcher: typeof fetch = fetch): Promise<IndicativeRoute> {
  const base = { checkedAt: new Date().toISOString(), sizeUsd };
  if (!sizes.includes(sizeUsd as typeof sizes[number])) return { ...base, state: "invalid_response" };
  if (!apiKey) return { ...base, state: "not_configured" };

  const pilot = await getIssuerPilot(fetcher);
  const tokenAddress = pilot.identity?.contractAddress;
  if (!tokenAddress || pilot.identity?.usdcAddress.toLowerCase() !== usdcAddress) return { ...base, state: "identity_unavailable" };
  const [tokenDecimals, usdcDecimals] = await Promise.all([
    readContract(tokenAddress, fetcher),
    readContract(usdcAddress, fetcher),
  ]);
  if (tokenDecimals !== 18 || usdcDecimals !== 6) return { ...base, state: "identity_unavailable" };

  const url = new URL(priceUrl);
  url.searchParams.set("chainId", "42161");
  url.searchParams.set("buyToken", tokenAddress);
  url.searchParams.set("sellToken", usdcAddress);
  url.searchParams.set("sellAmount", String(sizeUsd * 1_000_000));

  try {
    const response = await fetcher(url, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 429) return { ...base, state: "rate_limited" };
    if (response.status === 401) return { ...base, state: "auth_failed" };
    if (response.status === 403) {
      const message = object(await response.json().catch(() => null))?.message;
      return { ...base, state: typeof message === "string" && message.includes("explicit opt-in agreement") ? "rwa_access_required" : "access_denied" };
    }
    if (response.status === 400 || response.status === 422) return { ...base, state: "request_rejected" };
    if (!response.ok) return { ...base, state: "upstream_unavailable" };
    const parsed = parsePrice(await response.json(), tokenAddress, usdcAddress);
    if (parsed.state === "available" && parsed.sellAmount !== String(sizeUsd * 1_000_000)) return { ...base, state: "invalid_response" };
    return { ...base, tokenAddress, ...parsed };
  } catch {
    return { ...base, state: "upstream_unavailable" };
  }
}
