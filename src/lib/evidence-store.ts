import { LocalStore } from "./local-store";
import { hashEvidence, type PolicyEvidence, type PolicyDecision } from "./policy";
import { accountId } from "./account-context";

export interface EvidenceEntry { evidence: PolicyEvidence; decision: PolicyDecision; receipts: { hash: string; state: string; block: string | null; inputAmount: string; outputAmount: string | null; gasUsed: string | null }[] }
const store = new LocalStore<Record<string, EvidenceEntry>>("evidence", () => ({}));

export async function saveEvidence(evidence: PolicyEvidence, decision: PolicyDecision) {
  if (hashEvidence(evidence) !== decision.evidenceHash) throw new Error("evidence_hash_mismatch");
  await store.transaction((state) => { state[decision.evidenceHash] = { evidence, decision, receipts: state[decision.evidenceHash]?.receipts || [] }; });
}
export async function readEvidence(hash: string): Promise<EvidenceEntry | null> { return process.env.VERCEL === "1" && !accountId() ? null : store.transaction((state) => state[hash] || null); }
export async function saveReceipt(hash: string, receipt: EvidenceEntry["receipts"][number]) {
  await store.transaction((state) => { if (!state[hash]) throw new Error("evidence_missing"); state[hash].receipts = [...state[hash].receipts.filter((item) => item.hash !== receipt.hash), receipt]; });
}
