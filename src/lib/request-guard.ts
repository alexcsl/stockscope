import { LocalStore } from "./local-store";
import { hostedConfigured } from "./hosted-store";
import { accountId } from "./account-context";

const requests = new LocalStore<Record<string, { started: number; count: number; windowMs?: number }>>("requests", () => ({}));

export async function guardRequest(request: Request, bucket: string, limit = 20, maxBytes = 8192): Promise<Response | null> {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  if (origin && origin !== `${url.protocol}//${host}` || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Origin rejected" }, { status: 403 });
  if (process.env.VERCEL === "1" && (!hostedConfigured() || !accountId())) return Response.json({ state: "not_configured", error: "Sign in to enable configured providers and account storage." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (Number(request.headers.get("content-length") || 0) > maxBytes) return Response.json({ error: "Request too large" }, { status: 413 });
  const allowed = await requests.transaction((state) => {
    const now = Date.now();
    for (const [key, entry] of Object.entries(state)) if (now - entry.started >= (entry.windowMs || 60000)) delete state[key];
    const keys = accountId() ? [[bucket, limit * 10], [`${bucket}:${accountId()}`, limit]] as const : [[bucket, limit]] as const;
    if (keys.some(([key, cap]) => (state[key]?.count || 0) >= cap)) return false;
    for (const [key] of keys) { state[key] ||= { started: now, count: 0 }; state[key].count++; }
    return true;
  });
  return allowed ? null : Response.json({ error: "Request limit reached; retry in one minute" }, { status: 429, headers: { "Retry-After": "60" } });
}

export async function readSmallBody(request: Request, maxBytes = 8192): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); throw new Error("body_too_large"); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
