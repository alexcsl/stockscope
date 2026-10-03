"use client";

import { useEffect, useState } from "react";
import { instrumentKey, readResearchState } from "@/lib/research-state";

export function WatchInstrument({ issuer, chainId, contract, symbol }: { issuer: "robinhood" | "xstocks"; chainId: number; contract: string; symbol: string }) {
  const key = instrumentKey(issuer, chainId, contract);
  const [watching, setWatching] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const restore = () => {
      try { setWatching(readResearchState(localStorage.getItem("stockscope:research:v1")).watchlist.includes(key)); }
      catch { setMessage("Browser storage unavailable"); }
    };
    restore();
    window.addEventListener("stockscope:researchchange", restore);
    window.addEventListener("storage", restore);
    return () => { window.removeEventListener("stockscope:researchchange", restore); window.removeEventListener("storage", restore); };
  }, [key]);
  function toggle() {
    try {
      const state = readResearchState(localStorage.getItem("stockscope:research:v1"));
      const next = !state.watchlist.includes(key);
      state.watchlist = next ? [...state.watchlist, key] : state.watchlist.filter((item) => item !== key);
      localStorage.setItem("stockscope:research:v1", JSON.stringify(state));
      setWatching(next);
      window.dispatchEvent(new Event("stockscope:researchchange"));
    } catch { setMessage("Watchlist could not be saved in this browser."); }
  }
  return <><button className="filter-button" type="button" aria-label={`Watch ${symbol} / ${issuer}`} aria-pressed={watching} onClick={toggle}>{watching ? "Watching" : "Watch"}</button>{message ? <span className="cell-meta" role="status">{message}</span> : null}</>;
}
