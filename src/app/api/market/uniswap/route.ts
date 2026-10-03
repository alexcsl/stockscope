import { getUniswapRoute } from "@/lib/uniswap-route";
import { guardRequest, readSmallBody } from "@/lib/request-guard";
import { parseUnits } from "viem";

async function handlePOST(request: Request) {
  const denied = await guardRequest(request, "quotes");
  if (denied) return denied;
  const body: unknown = await readSmallBody(request).catch(() => null);
  const input = body !== null && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const symbol = input.symbol;
  const size = input.sizeUsd;
  const swapper = input.swapper;
  const direction = input.direction === "sell" ? "sell" : "buy";
  const tokenAmount = input.tokenAmount;
  if (
    typeof symbol !== "string" || !["AAPL", "NVDA", "TSLA"].includes(symbol) ||
    typeof size !== "number" || (direction === "buy" ? ![1, 5, 10, 100, 1000, 10000].includes(size) : size !== 0 || typeof tokenAmount !== "string" || !["0.01", "0.05", "0.1"].includes(tokenAmount)) ||
    typeof swapper !== "string" ||
    (input.direction !== undefined && input.direction !== "buy" && input.direction !== "sell") ||
    Object.keys(input).some((key) => !["symbol", "sizeUsd", "swapper", "direction", "tokenAmount"].includes(key))
  ) {
    return Response.json({ error: "Unsupported asset or size" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const route = await getUniswapRoute(symbol, size, swapper, process.env.UNISWAP_API_KEY, fetch, () => new Date(), direction === "sell" ? { direction, inputAmount: parseUnits(tokenAmount as string, 18).toString(), protocols: ["V3", "V4"] } : undefined);
  return Response.json(route, { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const POST = privateRoute(handlePOST, true);
