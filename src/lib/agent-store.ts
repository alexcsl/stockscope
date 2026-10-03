import { LocalStore } from "./local-store";
import type { ActionProposal, AgentReport } from "./agent-workflows";

interface AgentState { reports: AgentReport[]; proposals: ActionProposal[] }
const store = (directory?: string) => new LocalStore<AgentState>("agent-reports", () => ({ reports: [], proposals: [] }), directory);

export async function saveReport(report: AgentReport, directory?: string): Promise<void> {
  await store(directory).transaction((state) => {
    state.reports = [report, ...state.reports.filter((item) => item.id !== report.id)].slice(0, 200);
  });
}

export async function saveProposal(proposal: ActionProposal, directory?: string): Promise<void> {
  await store(directory).transaction((state) => {
    state.proposals = [proposal, ...state.proposals.filter((item) => item.id !== proposal.id)].slice(0, 200);
  });
}

export async function readAgentState(assetKey: string, directory?: string): Promise<AgentState> {
  return store(directory).transaction((state) => ({ reports: state.reports.filter((item) => item.assetKey === assetKey).slice(0, 20), proposals: state.proposals.filter((item) => item.assetKey === assetKey).slice(0, 20) }));
}
