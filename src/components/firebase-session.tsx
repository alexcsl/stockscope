"use client";

import { useEffect } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { firebaseAuth, syncFirebaseSession } from "@/lib/firebase-client";

export function FirebaseSession({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let pending = false;
    let controller: AbortController | undefined;
    const sync = async () => {
      if (pending || !firebaseAuth().currentUser) return;
      pending = true;
      controller = new AbortController();
      try {
        if (await syncFirebaseSession(false, controller.signal)) window.dispatchEvent(new Event("stockscope-account"));
      } catch { }
      finally { pending = false; }
    };
    const unsubscribe = onIdTokenChanged(firebaseAuth(), (user) => { if (!user) controller?.abort(); else void sync(); });
    const timer = window.setInterval(() => { void sync(); }, 300000);
    window.addEventListener("focus", sync);
    return () => { controller?.abort(); unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [enabled]);
  return null;
}
