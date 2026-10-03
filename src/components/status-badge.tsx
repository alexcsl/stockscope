import type { ReadinessStatus } from "@/lib/market-data";

export function StatusBadge({
  status,
  label,
}: {
  status: ReadinessStatus;
  label?: string;
}) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {label ?? status}
    </span>
  );
}
