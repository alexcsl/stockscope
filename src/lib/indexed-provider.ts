import { record } from "./observations";
import { cachedSource } from "./source-cache";

const requests = new WeakMap<typeof fetch, number[]>();

export function indexedJson(path: string, fetcher: typeof fetch = fetch) {
  return cachedSource(`indexed:${path}`, 60, async () => {
    const recent = (requests.get(fetcher) || []).filter((time) => time > Date.now() - 60000);
    if (recent.length >= 20) throw new Error("Chart source rate limit. Retry after one minute.");
    requests.set(fetcher, [...recent, Date.now()]);
    const response = await fetcher(`https://api.geckoterminal.com/api/v2${path}`, { headers: { Accept: "application/json;version=20230203" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(response.status === 429 ? "Chart source rate limit. Retry after one minute." : "Chart source is unavailable.");
    return { payload: record(await response.json()), retrievedAt: new Date().toISOString() };
  }, fetcher);
}
