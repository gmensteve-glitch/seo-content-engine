"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Clears pieces off the Ready list via /api/review/clear: one piece when
 * `draftId` is set, otherwise the whole list. Asks first, then refreshes the
 * page; a failure shows the server's reason next to the button.
 */
export function ClearReadyButton({
  draftId,
  confirm,
  title,
  className,
  icon,
  children,
}: {
  draftId?: string;
  confirm: string;
  title?: string;
  className?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm(confirm)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/review/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftId ? { draftIds: [draftId] } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok)
        throw new Error(data.error ?? `Clear failed (HTTP ${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && (
        <span className="max-w-[260px] text-[11px] text-[var(--danger)]">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title={title}
        aria-busy={pending}
        className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : icon}
        {pending && children ? "Clearing…" : children}
      </button>
    </span>
  );
}
