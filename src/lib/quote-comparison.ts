import { formatUnits } from "viem";
import type { UniswapRoute } from "./uniswap-route";

export function impliedUsdgPerToken(route: UniswapRoute): string | null {
  if (route.state !== "available" || !route.inputAmount || !route.outputAmount || !/^[1-9]\d*$/.test(route.inputAmount) || !/^[1-9]\d*$/.test(route.outputAmount)) return null;
  const input = BigInt(route.inputAmount);
  const output = BigInt(route.outputAmount);
  if (output === BigInt(0)) return null;
  return formatUnits(input * BigInt(10) ** BigInt(18) / output, 6);
}

export function quoteExpired(route: UniswapRoute, now = Date.now()): boolean {
  return route.state === "available" && (!route.expiresAt || !Number.isFinite(Date.parse(route.expiresAt)) || Date.parse(route.expiresAt) <= now);
}
