import type { ReactNode } from "react";

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-[13px] text-[var(--muted)]">{subtitle}</p>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "warn" | "danger";
}) {
  const color =
    accent === "success"
      ? "text-[var(--success)]"
      : accent === "warn"
        ? "text-[var(--warn)]"
        : accent === "danger"
          ? "text-[var(--danger)]"
          : "text-[var(--text)]";
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3.5 py-3">
      <div className="text-[12px] text-[var(--muted)]">{label}</div>
      <div className={`mt-0.5 text-[24px] font-medium ${color}`}>{value}</div>
    </div>
  );
}

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border)]",
  accent: "bg-[var(--accent-bg)] text-[var(--accent)] border-transparent",
  success: "bg-[var(--success-bg)] text-[var(--success)] border-transparent",
  warn: "bg-[var(--warn-bg)] text-[var(--warn)] border-transparent",
  danger: "bg-[var(--danger-bg)] text-[var(--danger)] border-transparent",
};

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Bar({ pct, tone = "success" }: { pct: number; tone?: Tone }) {
  const fill =
    tone === "warn"
      ? "var(--warn)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--success)";
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-0)]">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: fill }}
      />
    </div>
  );
}
