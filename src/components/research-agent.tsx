"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ReportSummary } from "./report-summary";
import type { ActionProposal, AgentReport } from "@/lib/agent-workflows";

gsap.registerPlugin(useGSAP);

export function ResearchAgent({ symbol, assetKey }: { symbol: string; assetKey: string }) {
  const [enabled, setEnabled] = useState(false);
  const [reports, setReports] = useState<AgentReport[]>([]);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [question, setQuestion] = useState("");
  const [tradeRequest, setTradeRequest] = useState("");
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const response = await fetch(`/api/agent/report?assetKey=${encodeURIComponent(assetKey)}`, { cache: "no-store" });
    if (!response.ok) { setEnabled(false); return; }
    const state = await response.json() as { reports: AgentReport[]; proposals: ActionProposal[] };
    setEnabled(true);
    setReports(state.reports);
    setProposals(state.proposals);
  }
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/agent/report?assetKey=${encodeURIComponent(assetKey)}`, { cache: "no-store", signal: abort.signal }).then(async (response) => {
      if (!response.ok) return;
      const state = await response.json() as { reports: AgentReport[]; proposals: ActionProposal[] };
      setEnabled(true);
      setReports(state.reports);
      setProposals(state.proposals);
    }).catch(() => {});
    return () => abort.abort();
  }, [assetKey]);
  useGSAP(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const section = document.querySelector("#research-agent");
    if (!section) return;
    gsap.fromTo(section.querySelector(".asset-section-title"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out", clearProps: "all" });
  }, { dependencies: [enabled], revertOnUpdate: true });
  useGSAP(() => {
    if (!reports.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const report = document.querySelector("#research-agent .agent-report");
    if (!report) return;
    gsap.fromTo(report, { borderTopColor: "transparent" }, { borderTopColor: getComputedStyle(report).borderTopColor, duration: 0.18, ease: "power2.out", clearProps: "borderTopColor" });
  }, { dependencies: [reports], revertOnUpdate: true });
  if (!enabled) return <section className="asset-section" id="research-agent"><h2 className="asset-section-title">Evidence desk</h2><div className="detail-card"><h3>Research account required</h3><p><a href="/account">Sign in</a> to save cited briefings, ask asset questions, and draft unsigned trade plans. If account services are unavailable, sourced identity, market, issuer, and event panels remain available.</p></div></section>;

  async function report(questionText?: string) {
    setBusy(true);
    try {
      let savedHash: string | null = null;
      try { savedHash = localStorage.getItem(`stockscope:policy:${symbol}`); } catch {}
      const evidenceHash = savedHash && /^0x[\da-f]{64}$/i.test(savedHash) ? savedHash : undefined;
      const response = await fetch("/api/agent/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, assetKey, evidenceHash, ...(questionText ? { question: questionText } : { topic: "briefing" }) }) });
      if (!response.ok) throw new Error("report_failed");
      const result = await response.json() as AgentReport;
      setMessage(result.kind === "unsupported" ? "This question is outside the available evidence topics." : "Cited report saved.");
      await load();
    } catch { setMessage("Report unavailable. Check current source and identity states."); }
    finally { setBusy(false); }
  }
  async function propose() {
    const report = reports.find((item) => item.kind !== "unsupported");
    if (!report) { setMessage("Create a cited report before drafting an action."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/agent/proposal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetKey, reportId: report.id, direction, amount }) });
      if (!response.ok) throw new Error("proposal_failed");
      setMessage("Unsigned proposal saved. Review the current route and policy before signing.");
      await load();
    } catch { setMessage("Proposal unavailable. Check the amount and cited report."); }
    finally { setBusy(false); }
  }
  async function draft() {
    const report = reports.find((item) => item.kind !== "unsupported");
    if (!report) { setMessage("Create a fresh cited briefing first."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/agent/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetKey, reportId: report.id, request: tradeRequest }) });
      const result = await response.json() as { state: string; message?: string; proposal?: ActionProposal };
      if (!response.ok || result.state !== "available" || !result.proposal) { setMessage(result.message || "AI drafting is unavailable. Your manual trade planner remains available."); return; }
      setDirection(result.proposal.direction);
      setAmount(result.proposal.amount);
      setMessage("AI draft saved. Review the exact token, amount, and sources, then continue to fresh trade checks. Your wallet must sign any transaction.");
      await load();
    } catch { setMessage("AI drafting is unavailable. No transaction was requested."); }
    finally { setBusy(false); }
  }
  const latest = reports[0];
  const aiDraft = proposals.find((item) => item.origin === "ai");
  const draftReport = reports.find((item) => item.id === aiDraft?.reportId);
  const aiPanel = <div className="detail-card agent-proposal"><div className="card-header"><h3>AI trade draft</h3><span className="card-tag">REVIEW BEFORE SIGNING</span></div><p className="card-intro">Tell the agent one exact trade. It uses your cited briefing to draft a plan. Fresh policy checks and your wallet signature are required before execution.</p><div className="research-form"><input aria-label="Trade request" maxLength={200} value={tradeRequest} disabled={busy} onChange={(event) => setTradeRequest(event.target.value)} placeholder={`Buy ${symbol} with 5 USDG`} /><button type="button" disabled={busy || !tradeRequest.trim() || !reports.some((item) => item.kind !== "unsupported")} onClick={draft}>Draft with AI</button></div>{aiDraft ? <div className="agent-report"><h4>Review your draft</h4><ul><li>{aiDraft.direction === "buy" ? "Buy" : "Sell"} {symbol} using exactly {aiDraft.amount} {aiDraft.inputUnit}</li><li>Exact token: {aiDraft.assetKey}</li><li>Unsigned draft. Current trade eligibility has not been established.</li></ul><p>{aiDraft.rationale}</p><div className="source-meta">{draftReport?.citations.filter((citation) => citation.url.startsWith("https://")).map((citation, index) => <a key={citation.id} href={citation.url} target="_blank" rel="noopener noreferrer">[{index + 1}] {citation.label}</a>)}<span>Model: {aiDraft.model} | {aiDraft.generatedAt}</span></div><div className="workflow-actions"><a href={aiDraft.handoffUrl}>Review AI draft and check trade</a></div></div> : null}</div>;
  return <section className="asset-section" id="research-agent" aria-labelledby="agent-title"><h2 className="asset-section-title" id="agent-title">Evidence desk</h2>{aiPanel}<div className="detail-card"><div className="card-header"><div><span className="section-kicker">ASSET RESEARCH</span><h3>Understand this asset</h3></div><span className="card-tag">RESEARCH ONLY</span></div><p className="card-intro">Create a short research summary, or ask a question about this token. Each factual answer links to its source. Missing information is listed separately.</p><div className="workflow-actions"><button type="button" disabled={busy} onClick={() => report()}>{busy ? "Creating summary..." : "Create briefing"}</button></div><div className="research-form"><input aria-label="Asset question" maxLength={200} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="For example: Where does this token trade?" /><button type="button" disabled={busy || !question.trim()} onClick={() => report(question)}>Ask</button></div><p className="workflow-message" role="status">{message}</p>{latest ? <ReportSummary report={latest} /> : <p className="cell-meta">No briefing yet. Create one to see a cited summary of this asset.</p>}</div><div className="detail-card agent-proposal"><div className="card-header"><h3>Plan a trade</h3><span className="card-tag">NO TRANSACTION YET</span></div><p className="card-intro">Save the direction and amount you want to trade. Continue to the trade workspace when you are ready to request a fresh estimate and review safety checks. Saving a plan does not send a transaction.</p><div className="route-controls"><label htmlFor="proposal-direction">Direction</label><select id="proposal-direction" value={direction} onChange={(event) => setDirection(event.target.value as "buy" | "sell")}><option value="buy">Buy with USDG</option><option value="sell">Sell for USDG</option></select><label htmlFor="proposal-amount">Exact input ({direction === "buy" ? "USDG" : symbol})</label><input id="proposal-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div><div className="workflow-actions"><button type="button" disabled={busy || !reports.some((item) => item.kind !== "unsupported")} onClick={propose}>Save trade plan</button></div>{proposals[0] ? <p className="workflow-message">{proposals[0].direction} {proposals[0].amount} {proposals[0].inputUnit} · evidence {proposals[0].evidenceHash.slice(0, 14)}… · <a href={proposals[0].handoffUrl}>Continue to trade checks</a></p> : null}</div></section>;
}
