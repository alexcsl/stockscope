import type { SourcedAsset } from "@/lib/robinhood-data";
import { orderedEvents, eventDetail } from "@/lib/event-timeline";
import { sourceValue } from "@/lib/observations";
import { SourceLabel } from "./source-label";
import { parseUnits } from "viem";

export function EventTimeline({ asset }: { asset: SourcedAsset }) {
  const events = sourceValue(asset.events);
  const identity = sourceValue(asset.identity);
  const chain = sourceValue(asset.chain);
  const multiplierVerified = !!identity && !!chain && BigInt(chain.multiplier) === parseUnits(identity.multiplier, 18);

  return <section className="detail-card" aria-labelledby="event-title"><div className="card-header"><h2 id="event-title">Corporate action timeline</h2><span className="card-tag">{asset.events.state.toUpperCase()}</span></div><p className="card-intro">Issuer process dates are not necessarily dividend payment dates. A current multiplier check does not prove an event caused a change.</p>{events ? events.length ? <ol className="event-timeline">{orderedEvents(events).slice(0, 12).map((event, index) => <li key={`${event.id}:${event.type}:${event.processDate}:${index}`}><div><time dateTime={event.processDate || undefined}>{event.processDate || "Date unknown"}</time></div><div><strong>{event.type.replace("CORPORATE_ACTION_TYPE_", "").replaceAll("_", " ")}</strong><p>Status: {event.status.replace("CORPORATE_ACTION_STATUS_", "").replaceAll("_", " ")}</p><p>{eventDetail(event)}</p><p>Verified event-specific multiplier effect: unavailable. {multiplierVerified ? `Current issuer/onchain multiplier agrees at block ${chain.block}; no causal link to this event is asserted.` : "Current issuer/onchain multiplier agreement is unavailable."}</p><a href={asset.events.source.url} target="_blank" rel="noopener noreferrer">Issuer event record</a></div></li>)}</ol> : <p className="workflow-message">No issuer events returned for this deployment.</p> : <p className="workflow-message">Event evidence unavailable. Unknown events do not pass policy checks.</p>}<SourceLabel source={asset.events.source} /></section>;
}
