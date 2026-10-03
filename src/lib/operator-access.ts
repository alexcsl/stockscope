export function operatorEnabled(): boolean {
  return process.env.VERCEL !== "1" && process.env.STOCKSCOPE_LOCAL_OPERATOR === "1";
}

export function operatorRequest(request: Request, mutation = false): Response | null {
  if (!operatorEnabled()) return Response.json({ error: "Local operator mode is disabled" }, { status: 403 });
  const url = new URL(request.url);
  const host = request.headers.get("host") || url.host;
  let hostname: string;
  try { hostname = new URL(`${url.protocol}//${host}`).hostname; }
  catch { return Response.json({ error: "Invalid host" }, { status: 403 }); }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return Response.json({ error: "Loopback host required" }, { status: 403 });
  if (mutation && (request.headers.get("origin") !== `${url.protocol}//${host}` || request.headers.get("sec-fetch-site") === "cross-site")) return Response.json({ error: "Same-origin request required" }, { status: 403 });
  return null;
}
