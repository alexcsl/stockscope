"use client";
import { useEffect, useId, useRef, useState } from "react";
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const pinned = useRef(false);
  const dismiss = () => { pinned.current = false; setOpen(false); };
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { pinned.current = false; setOpen(false); } };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return <span className="info-tip" ref={root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!pinned.current) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") dismiss(); }}><button type="button" className="info-trigger" aria-label={`About ${label}`} aria-expanded={open} aria-controls={id} onFocus={() => { pinned.current = true; setOpen(true); }} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) dismiss(); }} onClick={() => { pinned.current = true; setOpen(true); }}>i</button>{open ? <span className="info-content" id={id} role="note"><strong>{label}</strong>{children}<button type="button" className="info-close" onClick={dismiss} aria-label={`Close ${label} explanation`}>Close</button></span> : null}</span>;
}
