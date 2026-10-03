import { privateRoute } from "@/lib/account-access";
import { LocalStore } from "@/lib/local-store";
import { readSmallBody } from "@/lib/request-guard";

type Workspace = { watchlist: string[]; views: { id: string; name: string; query: string }[] };
const store = new LocalStore<Workspace>("workspace", () => ({ watchlist: [], views: [] }));
export const GET = privateRoute(async () => Response.json(await store.transaction((state) => state), { headers: { "Cache-Control": "no-store" } }));
export const PUT = privateRoute(async (request) => {
  const input = await readSmallBody(request).catch(() => null) as Workspace | null;
  if (!input || !Array.isArray(input.watchlist) || input.watchlist.length > 100 || input.watchlist.some((key) => typeof key !== "string" || !/^(robinhood:4663|xstocks:42161):0x[\da-f]{40}$/i.test(key)) || !Array.isArray(input.views) || input.views.length > 20 || input.views.some((view) => typeof view?.id !== "string" || view.id.length > 64 || typeof view.name !== "string" || view.name.length > 40 || typeof view.query !== "string" || view.query.length > 1024 || view.query && !view.query.startsWith("?"))) return Response.json({ error: "Invalid saved workspace" }, { status: 400 });
  await store.transaction((state) => { state.watchlist = [...new Set(input.watchlist)]; state.views = input.views.map(({ id, name, query }) => ({ id, name, query })); });
  return Response.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
});
