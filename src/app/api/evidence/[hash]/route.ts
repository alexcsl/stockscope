import { readEvidence } from "@/lib/evidence-store";

async function handleGET(_request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^0x[\da-f]{64}$/i.test(hash)) return Response.json({ error: "Invalid evidence hash" }, { status: 400 });
  const evidence = await readEvidence(hash);
  return evidence ? Response.json(evidence, { headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="stockscope-${hash.slice(2, 10)}.json"` } }) : Response.json({ error: "Evidence not found" }, { status: 404 });
}
import { privateRoute } from "@/lib/account-access";
export const GET = privateRoute(handleGET, true);
