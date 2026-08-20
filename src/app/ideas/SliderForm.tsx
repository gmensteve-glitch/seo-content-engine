"use client";

import { useState } from "react";
import { MapPin, BookOpen } from "lucide-react";

/**
 * Client-side slider + Save form. The label updates live as you drag (a server
 * component can't do that), and the value posts to the server action on Save.
 */
export function SliderForm({
  action,
  name,
  min,
  max,
  step,
  initial,
  variant,
  saveLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  variant: "threshold" | "mix";
  saveLabel: string;
}) {
  const [v, setV] = useState(initial);
  const mix = variant === "mix";
  const dirty = v !== initial;

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      {mix ? (
        <span className="flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)]">
          <MapPin size={13} /> Local {v}%
        </span>
      ) : (
        <span className="text-[12.5px] font-medium text-[var(--success)]">{v}/100</span>
      )}
      <input
        type="range"
        name={name}
        min={min}
        max={max}
        step={step}
        value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className={`h-1.5 min-w-[180px] flex-1 ${mix ? "accent-[var(--accent)]" : "accent-[var(--success)]"}`}
      />
      {mix && (
        <span className="flex items-center gap-1 text-[12.5px] text-[var(--muted)]">
          <BookOpen size={13} /> Evergreen {100 - v}%
        </span>
      )}
      <button
        className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110 disabled:opacity-40 ${
          mix ? "bg-[var(--accent)]" : "bg-[var(--success)]"
        }`}
      >
        {dirty ? saveLabel : "Saved"}
      </button>
    </form>
  );
}
