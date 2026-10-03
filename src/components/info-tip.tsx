"use client";
import { useEffect, useId, useRef, useState } from "react";
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <span className="info-tip" ref={root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}><button type="button" className="info-trigger" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false); }} onClick={() => setOpen(true)}>i</button>{open ? <span className="info-content" id={id} role="note"><strong>{label}</strong>{children}<button type="button" className="info-close" onClick={() => setOpen(false)} aria-label={`Close ${label} explanation`}>Close</button></span> : null}</span>;
}
