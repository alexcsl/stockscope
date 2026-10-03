export function Sparkline({
  values,
  color,
  label,
}: {
  values: number[];
  color: string;
  label: string;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 116 + 2;
      const y = 39 - ((value - min) / range) * 30;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="sparkline"
      viewBox="0 0 120 48"
      role="img"
      aria-label={`${label} illustrative trend`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
