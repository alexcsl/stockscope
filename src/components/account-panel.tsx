"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { FirebaseLogin } from "./firebase-login";

export function AccountPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const [emailDelivery, setEmailDelivery] = useState(false);
  const [firebaseEnabled, setFirebaseEnabled] = useState(false);
  const [legacy, setLegacy] = useState(false);
  useEffect(() => {
    async function load() {
      const code = new URL(window.location.href).searchParams.get("code");
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
        if (code) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (error) setMessage("This sign-in link is invalid or expired. Request another link.");
          window.history.replaceState(null, "", "/account" + (window.location.search.includes("recovery=1") ? "?recovery=1" : ""));
        } else await client.auth.getSession();
      }
      setRecovery(new URL(window.location.href).searchParams.has("recovery"));
      const response = await fetch("/api/account", { cache: "no-store" });
      setAvailable(response.ok);
      if (response.ok) {
        const result = await response.json();
        setAccount(result.email);
        setEmailDelivery(result.emailDeliveryEnabled === true);
        setFirebaseEnabled(result.firebaseEnabled === true);
      }
    }
    const refresh = () => { void load().catch(() => setMessage("Account service unavailable.")).finally(() => setLoading(false)); };
    refresh();
    window.addEventListener("stockscope-account", refresh);
    return () => window.removeEventListener("stockscope-account", refresh);
  }, []);
  async function submit(action: string) {
    setBusy(true);
    try {
      if (action === "logout" && firebaseEnabled) {
        const [{ signOut }, { firebaseAuth }] = await Promise.all([import("firebase/auth"), import("@/lib/firebase-client")]);
        await signOut(firebaseAuth());
      }
      const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, password }) });
      const result = await response.json();
      setMessage(result.message || result.error);
      setPassword("");
      if (response.ok && action === "login") { router.push("/terminal"); router.refresh(); }
      if (response.ok && action === "logout") { setAccount(null); window.location.reload(); }
      if (response.ok && action === "password") setRecovery(false);
    } catch { setMessage("Account service unavailable. Retry later."); }
    finally { setBusy(false); }
  }
  if (!loading && available && !account && firebaseEnabled && !legacy) return <section className="detail-card"><h2>Research account</h2><p>Sign in to save your research across devices.</p><FirebaseLogin onLegacy={() => setLegacy(true)} onSignedIn={(value) => { setAccount(value); router.push("/terminal"); router.refresh(); }} /></section>;
  async function clearResearch() {
    if (!window.confirm("Delete your saved reports, unsigned plans, monitored rules, workspace, and evidence? This cannot be undone. Your sign-in account and browser watchlist remain.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      setMessage(response.ok ? "Saved research deleted. AI spending records remain for budget enforcement." : "Saved research could not be deleted.");
    } catch { setMessage("Account service unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="detail-card"><h2>Research account</h2><p>Sign in to save your research across devices.</p>{loading ? <p role="status">Checking your account...</p> : !available ? <p role="status">Account service unavailable. Public research remains available.</p> : account ? <><p>Signed in as {account}</p>{recovery ? <label>New password<input aria-label="New password" type="password" minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label> : null}<div className="workflow-actions">{recovery ? <button disabled={busy || password.length < 12} onClick={() => submit("password")}>Update password</button> : null}<a href="/api/account/data">Export saved research</a><button disabled={busy} onClick={clearResearch}>Delete saved research</button><button disabled={busy} onClick={() => submit("logout")}>Sign out</button></div></> : <form onSubmit={(event) => { event.preventDefault(); void submit("login"); }}><div className="research-form"><label>Email<input aria-label="Email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input aria-label="Password" type="password" minLength={12} maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></div><div className="workflow-actions"><button type="submit" disabled={busy}>Sign in</button><button type="button" disabled={busy || !emailDelivery || !email || password.length < 12} onClick={() => submit("signup")}>Create account</button><button type="button" disabled={busy || !emailDelivery || !email} onClick={() => submit("recover")}>Recover password</button></div><p className="cell-meta">Use at least 12 characters. Confirm your email before saving research. {emailDelivery ? null : "New account confirmation and recovery email are unavailable on this deployment."}</p></form>}{message ? <p role="status" className="workflow-message">{message}</p> : null}</section>;
}
