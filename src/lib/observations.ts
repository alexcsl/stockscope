export type Observation<T> =
  | { state: "available" | "stale"; value: T; source: Provenance; reason?: string }
  | { state: "unavailable" | "error"; reason: string; source: Provenance };

export interface Provenance {
  provider: string;
  url: string;
  observedAt: string | null;
  retrievedAt: string;
  scope: string;
  unit: string;
}

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function decimal(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d*)(\.\d{1,36})?$/.test(value) && value.length <= 100;
}

export function address(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[\da-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
}

export function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function displayDecimal(value: string, digits = 4): string {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, digits).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString("en-US")}${trimmed ? `.${trimmed}` : ""}`;
}

export function sourceValue<T>(observation: Observation<T>): T | null {
  return "value" in observation ? observation.value : null;
}
