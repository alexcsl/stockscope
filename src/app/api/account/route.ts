import { authClient, authConfigured, currentAccount, privateRoute, supabaseAuthConfigured } from "@/lib/account-access";
import { cookies } from "next/headers";
import { firebaseConfigured, firebaseCookie, verifiedFirebaseAccount } from "@/lib/firebase-auth";
import { readSmallBody } from "@/lib/request-guard";
import { LocalStore } from "@/lib/local-store";
import { database, hostedConfigured } from "@/lib/hosted-store";
import { accountId } from "@/lib/account-context";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!authConfigured()) return Response.json({ state: "not_configured" }, { status: 503 });
  try {
    const user = await currentAccount();
    return Response.json({ state: user ? "signed_in" : "signed_out", email: user?.email || null, provider: user?.provider || null, firebaseEnabled: firebaseConfigured(), emailDeliveryEnabled: process.env.STOCKSCOPE_EMAIL_DELIVERY === "1" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ state: "unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Same-origin request required" }, { status: 403 });
  if (!authConfigured()) return Response.json({ error: "Accounts unavailable" }, { status: 503 });
  const input = await readSmallBody(request).catch(() => null) as { action?: string; email?: string; password?: string; token?: string } | null;
  if (!input || !["login", "signup", "logout", "recover", "password", "firebase"].includes(input.action || "")) return Response.json({ error: "Invalid account request" }, { status: 400 });
  if (["signup", "recover"].includes(input.action!) && process.env.STOCKSCOPE_EMAIL_DELIVERY !== "1") return Response.json({ state: "not_configured", error: "Account email delivery is unavailable. Existing verified accounts can sign in." }, { status: 503 });
  try {
    if (hostedConfigured()) {
      const key = createHash("sha256").update(request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "local").digest("hex");
      const allowed = await new LocalStore<Record<string, { count: number; started: number; windowMs?: number }>>("requests", () => ({})).transaction((state) => {
        const now = Date.now();
        const names = [["auth:all", 200], [`auth:${key}`, 20]] as const;
        for (const [name] of names) if (!state[name] || now - state[name].started >= 3600000) state[name] = { count: 0, started: now, windowMs: 3600000 };
        if (names.some(([name, cap]) => state[name].count >= cap)) return false;
        for (const [name] of names) state[name].count++;
        return true;
      });
      if (!allowed) return Response.json({ error: "Account request limit reached. Retry later." }, { status: 429 });
    }
    if (input.action === "firebase") {
      if (!firebaseConfigured() || !hostedConfigured()) return Response.json({ error: "Email sign-in unavailable" }, { status: 503 });
      if (typeof input.token !== "string") return Response.json({ error: "Invalid sign-in token" }, { status: 400 });
      const user = await verifiedFirebaseAccount(input.token);
      if (!user) return Response.json({ error: "Confirm your email before saving research" }, { status: 401 });
      (await cookies()).set(firebaseCookie, input.token, { httpOnly: true, secure: process.env.VERCEL === "1" || url.protocol === "https:", sameSite: "strict", path: "/", maxAge: Math.max(0, Math.floor(user.expires - Date.now() / 1000)) });
      return Response.json({ message: "Signed in", email: user.email }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "logout") {
      (await cookies()).delete(firebaseCookie);
      const error = supabaseAuthConfigured() ? (await (await authClient()).auth.signOut()).error : null;
      return Response.json({ message: error ? "Sign out unavailable" : "Signed out" }, { status: error ? 503 : 200 });
    }
    const client = await authClient();
    if (input.action === "password") {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return Response.json({ error: "Sign in through your recovery link first" }, { status: 401 });
      if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) return Response.json({ error: "Use a password between 12 and 128 characters" }, { status: 400 });
      const { error } = await client.auth.updateUser({ password: input.password });
      return Response.json(error ? { error: "Password update unavailable" } : { message: "Password updated" }, { status: error ? 400 : 200 });
    }
    if (typeof input.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return Response.json({ error: "Enter a valid email address" }, { status: 400 });
    if (input.action === "recover") {
      await client.auth.resetPasswordForEmail(input.email, { redirectTo: `${origin}/account?recovery=1` });
      return Response.json({ message: "If an account exists, check your email for a recovery link." });
    }
    if (typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128) return Response.json({ error: "Use a password between 12 and 128 characters" }, { status: 400 });
    const result = input.action === "signup" ? await client.auth.signUp({ email: input.email, password: input.password, options: { emailRedirectTo: `${origin}/account` } }) : await client.auth.signInWithPassword({ email: input.email, password: input.password });
    if (result.error) return Response.json({ error: input.action === "login" ? "Sign in failed. Check your email, password, and email confirmation." : "Account creation unavailable. Retry later or use an existing account." }, { status: 400 });
    return Response.json({ message: input.action === "signup" && !result.data.session ? "Check your email to confirm your account, then sign in." : "Signed in" });
  } catch { return Response.json({ error: "Account service unavailable" }, { status: 503 }); }
}

export const DELETE = privateRoute(async () => {
  if (!hostedConfigured()) return Response.json({ error: "Account storage unavailable" }, { status: 503 });
  await database()`delete from stockscope.state where owner = ${accountId()!}`;
  await new LocalStore<{ cache: Record<string, unknown>; owners?: Record<string, string> }>("analyst", () => ({ cache: {} })).transaction((state) => {
    for (const [id, owner] of Object.entries(state.owners || {})) if (owner === accountId()) { delete state.cache[id]; delete state.owners![id]; }
  });
  return Response.json({ removed: true }, { headers: { "Cache-Control": "no-store" } });
});
