import { comparisonRecord, parseSelection } from "@/lib/comparison";
import { cachedSource } from "@/lib/source-cache";
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("asset") || "";
  const selected = parseSelection(raw);
  if (selected.length !== 1 || raw !== `${selected[0].issuer}:${selected[0].symbol}`) return Response.json({ error: "Choose one supported exact instrument" }, { status: 400 });
  return Response.json(await cachedSource(`comparison:${raw}`, 60, () => comparisonRecord(selected[0])), { headers: { "Cache-Control": "private, max-age=15" } });
}
