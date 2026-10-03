import type { IssuerEvent } from "./robinhood-data";
import { decimal, record } from "./observations";

export function orderedEvents(events: IssuerEvent[]): IssuerEvent[] {
  return [...events].sort((a, b) => (a.processDate === null ? 1 : b.processDate === null ? -1 : b.processDate.localeCompare(a.processDate)) || a.type.localeCompare(b.type));
}

export function eventDetail(event: IssuerEvent): string {
  const dividend = record(event.details.cashDividend);
  if (event.type === "CORPORATE_ACTION_TYPE_CASH_DIVIDEND" && decimal(dividend?.rate)) return `Issuer reports a cash dividend rate of ${dividend.rate}. Currency and Stock Token treatment require asset-specific terms.`;
  return "The issuer record does not establish a verified change to this token's multiplier.";
}
