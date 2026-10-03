import { getIndicativeRoute } from "@/lib/indicative-route";
import { guardRequest } from "@/lib/request-guard";

async function handleGET(request: Request) {
  const denied = await guardRequest(request, "legacy-quotes");
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const asset = params.get("asset");
  const size = params.get("sizeUsd");
  if (asset !== "nvdax" || !["100", "1000", "10000"].includes(size ?? "") || [...params.keys()].some((key) => key !== "asset" && key !== "sizeUsd")) {
    return Response.json({ error: "Unsupported asset or size" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const route = await getIndicativeRoute(Number(size), process.env.ZEROX_API_KEY);
  return Response.json(route, { headers: { "Cache-Control": "no-store" } });
}
import { privateRoute } from "@/lib/account-access";
export const GET = privateRoute(handleGET, true);
