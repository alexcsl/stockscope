import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withAccountId } from "./account-context";
import { hostedConfigured } from "./hosted-store";
import { operatorRequest } from "./operator-access";
import { guardRequest } from "./request-guard";
import { firebaseConfigured, firebaseCookie, verifiedFirebaseAccount } from "./firebase-auth";

export function authConfigured(): boolean { return firebaseConfigured() || supabaseAuthConfigured(); }
export function supabaseAuthConfigured(): boolean { return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
export async function authClient() {
  if (!supabaseAuthConfigured()) throw new Error("auth_not_configured");
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: (items) => { for (const { name, value, options } of items) jar.set(name, value, options); } },
  });
}

export async function currentAccount() {
  const token = (await cookies()).get(firebaseCookie)?.value;
  if (token && firebaseConfigured()) return verifiedFirebaseAccount(token);
  if (!supabaseAuthConfigured()) return null;
  const { data: { user }, error } = await (await authClient()).auth.getUser();
  return !error && user?.email_confirmed_at && user.email ? { id: user.id, email: user.email, provider: "supabase" as const } : null;
}

export function privateRoute<T extends unknown[]>(handler: (request: Request, ...args: T) => Promise<Response>, localOpen = false) {
  return async (request: Request, ...args: T): Promise<Response> => {
    if (process.env.VERCEL !== "1" && !hostedConfigured()) {
      const denied = localOpen ? null : operatorRequest(request, !["GET", "HEAD"].includes(request.method));
      if (denied) return denied;
      return handler(request, ...args);
    }
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    const expected = `${url.protocol}//${request.headers.get("host") || url.host}`;
    if ((!['GET', 'HEAD'].includes(request.method) && origin !== expected) || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Same-origin request required" }, { status: 403 });
    if (!authConfigured() || !hostedConfigured()) return Response.json({ state: "not_configured", error: "Account storage is unavailable" }, { status: 503 });
    try {
      const user = await currentAccount();
      if (!user) return Response.json({ error: "Sign in with a verified account" }, { status: 401 });
      return await withAccountId(user.id, async () => {
        const denied = await guardRequest(request, `account:${url.pathname}`, request.method === "GET" ? 60 : 10, url.pathname === "/api/agent/monitor" ? 32768 : 8192);
        return denied || handler(request, ...args);
      });
    } catch {
      return Response.json({ state: "unavailable", error: "Account service unavailable. Retry later." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  };
}
