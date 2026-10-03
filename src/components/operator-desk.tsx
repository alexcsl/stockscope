"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { SourcedAsset } from "@/lib/robinhood-data";
import { sourceValue } from "@/lib/observations";
import { instrumentKey, readResearchState } from "@/lib/research-state";
import type { MonitorAlert, MonitoredRule } from "@/lib/monitor";

const storageKey = "stockscope:research:v1";
gsap.registerPlugin(useGSAP);

export function OperatorDesk({ assets }: { assets: SourcedAsset[] }) {
  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState<MonitoredRule[]>([]);
  const [alerts, setAlerts] = useState<MonitorAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch("/api/agent/monitor", { cache: "no-store" });
    if (!response.ok) { setEnabled(false); return; }
    const state = await response.json() as { rules: MonitoredRule[]; alerts: MonitorAlert[] };
    setEnabled(true);
    setRules(state.rules);
    setAlerts(state.alerts.slice().reverse());
  }
  useEffect(() => {
    void fetch("/api/agent/monitor", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const state = await response.json() as { rules: MonitoredRule[]; alerts: MonitorAlert[] };
      setEnabled(true);
      setRules(state.rules);
      setAlerts(state.alerts.slice().reverse());
    }).catch(() => {});
  }, []);
  useGSAP(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const section = document.querySelector(".operator-desk");
    if (!section) return;
    gsap.fromTo(section.querySelector(".research-heading"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out", clearProps: "all" });
  }, { dependencies: [enabled], revertOnUpdate: true });
  if (!enabled) return null;

  async function importRules() {
    setBusy(true);
    try {
      const saved = readResearchState(localStorage.getItem(storageKey));
      const keyed = assets.flatMap((asset) => {
        const identity = sourceValue(asset.identity);
        return identity ? [{ key: instrumentKey("robinhood", 4663, identity.contract), symbol: asset.symbol }] : [];
      });
      const incoming: MonitoredRule[] = saved.rules.flatMap((rule) => {
        const matched = keyed.find((item) => item.key === rule.assetKey);
        return matched ? [{ ...rule, symbol: matched.symbol, version: 1, enabled: true }] : [];
      });
      const response = await fetch("/api/agent/monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", rules: incoming }) });
      if (!response.ok) throw new Error((await response.json()).error || "import_failed");
      const result = await response.json() as { imported: number };
      setMessage(`${result.imported} rules imported. Existing rules were kept.`);
      await load();
    } catch { setMessage("Rule import failed. Check exact asset identity and local operator settings."); }
    finally { setBusy(false); }
  }
  async function run() {
    setBusy(true);
    try {
      const response = await fetch("/api/agent/monitor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
      if (!response.ok) throw new Error("monitor_failed");
      const result = await response.json() as { checked: number; alerts: number };
      setMessage(`Checked ${result.checked} exact instruments. ${result.alerts} new notices.`);
      await load();
    } catch { setMessage("The monitor run failed. Saved alerts remain available."); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/agent/monitor?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("remove_failed");
      await load();
    } catch { setMessage("Could not remove the monitored rule."); }
    finally { setBusy(false); }
  }

  return <section className="research-tools operator-desk" id="monitor" aria-labelledby="monitor-title"><div className="research-heading"><div><span className="section-kicker">EVIDENCE MONITOR</span><h2 id="monitor-title">Scheduled monitor</h2><p>Hosted rules are checked daily and when you select Check now. Local scheduling is configured separately. Notices appear here when this page opens; email and push delivery are not enabled.</p></div><div className="workflow-actions"><button type="button" disabled={busy} onClick={importRules}>Import browser alerts</button><button type="button" disabled={busy || !rules.length} onClick={run}>{busy ? "Checking…" : "Check now"}</button></div></div><p className="cell-meta" role="status">{message || "Only exact verified instruments can be monitored."}</p><div className="research-columns"><div><h3>Monitored rules</h3>{rules.length ? rules.map((rule) => <div className="research-item" key={rule.id}><span>{rule.symbol} · {rule.kind.replaceAll("_", " ")}{rule.threshold ? ` · $${rule.threshold} pool liquidity` : ""}</span><button type="button" disabled={busy} onClick={() => remove(rule.id)}>Remove</button></div>) : <p className="cell-meta">Import browser alerts to start scheduling.</p>}</div><div className="operator-alerts"><h3>In-app notices</h3>{alerts.length ? alerts.slice(0, 20).map((alert) => <div className="research-alert" key={alert.id}><strong>{alert.message}</strong><span>{alert.kind === "source_health" ? "Source health" : `Rule version ${alert.ruleVersion}`} · {alert.evaluatedAt}</span><span>Evidence {alert.evidenceHash.slice(0, 14)}… · current observation {alert.currentId.slice(0, 14)}…</span>{alert.evidenceUrl ? <a href={alert.evidenceUrl} target="_blank" rel="noopener noreferrer">Source evidence</a> : null}</div>) : <p className="cell-meta">No scheduled notices yet.</p>}</div></div></section>;
}
