export function ActionProgress({ step }: { step: number }) {
  return <ol className="action-progress" aria-label="Trade preparation steps">{["Choose amount", "Get estimate", "Review checks", "Approve amount", "Confirm in wallet", "Check receipt"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>;
}
