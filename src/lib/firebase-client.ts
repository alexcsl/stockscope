"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

let syncedToken: string | undefined;

export function firebaseAuth() {
  const app = getApps().some((item) => item.name === "stockscope") ? getApp("stockscope") : initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID }, "stockscope");
  return getAuth(app);
}

export async function syncFirebaseSession(force = false, signal?: AbortSignal) {
  const user = firebaseAuth().currentUser;
  if (!user) return false;
  const token = await user.getIdToken(force);
  if (firebaseAuth().currentUser?.uid !== user.uid || signal?.aborted) return false;
  if (!force && token === syncedToken) return false;
  const response = await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "firebase", token }), signal });
  if (response.ok) syncedToken = token;
  return response.ok;
}
