import { readDemoStatus } from "@/lib/demo-status";
import { loadTestnetManifest } from "@/lib/testnet-execution";

export async function GET() {
  return Response.json(await readDemoStatus(await loadTestnetManifest()), { headers: { "Cache-Control": "no-store" } });
}
