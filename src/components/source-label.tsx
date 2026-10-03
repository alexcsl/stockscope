import type { Provenance } from "@/lib/observations";

export function SourceLabel({ source }: { source: Provenance }) {
  return <details className="source-details"><summary>{source.provider} / {source.observedAt ? `Observed ${new Date(source.observedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC` : "Source time unknown"}</summary><div className="source-meta"><a href={source.url} target="_blank" rel="noopener noreferrer">{source.provider}</a><span>{source.unit}</span><span>Observed: {source.observedAt || "source time unavailable"}</span><span>Retrieved: {source.retrievedAt}</span></div></details>;
}
