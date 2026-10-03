"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth, syncFirebaseSession } from "@/lib/firebase-client";

export function FirebaseLogin({ onSignedIn, onLegacy }: { onSignedIn: (email: string) => void; onLegacy: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  async function submit(action: "login" | "signup" | "recover" | "confirm") {
    setBusy(true);
    try {
      const auth = firebaseAuth();
      if (action === "recover") {
        await sendPasswordResetEmail(auth, email);
        setMessage("If an account exists, check your email for a password reset link.");
      } else if (action === "confirm") {
        if (!auth.currentUser || auth.currentUser.emailVerified) throw new Error("confirmation_unavailable");
        await sendEmailVerification(auth.currentUser);
        setMessage("Confirmation email requested. Check your inbox and spam folder.");
      } else {
        const { user } = action === "signup" ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password);
        setPassword("");
        if (!user.emailVerified) {
          setConfirmation(true);
          if (action === "signup") {
            try { await sendEmailVerification(user); }
            catch { setMessage("Account created, but confirmation email is unavailable. Retry sending it."); return; }
          }
          setMessage("Confirm your email, then sign in to save research. Check your inbox and spam folder.");
        } else if (await syncFirebaseSession(true)) onSignedIn(user.email!);
        else setMessage("Email sign-in could not be verified. Retry later.");
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      setMessage(action === "recover" && code === "auth/user-not-found" ? "If an account exists, check your email for a password reset link." : code === "auth/too-many-requests" ? "Too many requests. Wait before trying again." : "Account request failed. Check your details or retry later.");
    } finally { setBusy(false); }
  }
  return <><form onSubmit={(event) => { event.preventDefault(); void submit("login"); }}><div className="research-form"><label>Email<input aria-label="Email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input aria-label="Password" type="password" required minLength={12} maxLength={128} placeholder="At least 12 characters" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label></div><div className="workflow-actions"><button type="submit" disabled={busy}>Sign in</button><button type="button" disabled={busy || !email || password.length < 12} onClick={() => submit("signup")}>Create account</button><button type="button" disabled={busy || !email} onClick={() => submit("recover")}>Recover password</button>{confirmation ? <button type="button" disabled={busy} onClick={() => submit("confirm")}>Resend confirmation</button> : null}</div></form>{message ? <p role="status" className="workflow-message">{message}</p> : null}<details className="cell-meta"><summary>Older account?</summary><button type="button" disabled={busy} onClick={onLegacy}>Sign in to an older account</button></details></>;
}
