import { test } from "node:test";
import assert from "node:assert/strict";
import { eventDetail, orderedEvents } from "../src/lib/event-timeline";
import type { IssuerEvent } from "../src/lib/robinhood-data";

const sample = (date: string | null, details: Record<string, unknown> = {}): IssuerEvent => ({ id: "asset", type: "CORPORATE_ACTION_TYPE_CASH_DIVIDEND", status: "CORPORATE_ACTION_STATUS_IN_PROGRESS", processDate: date, details });

test("event timeline keeps dated records ordered and unknown effects explicit", () => {
  assert.deepEqual(orderedEvents([sample(null), sample("2026-01-02"), sample("2026-09-28")]).map((event) => event.processDate), ["2026-09-28", "2026-01-02", null]);
  assert.match(eventDetail(sample("2026-09-28", { cashDividend: { rate: "0.525" } })), /Currency and Stock Token treatment require/);
  assert.match(eventDetail(sample("2026-09-28")), /does not establish a verified change/);
});
