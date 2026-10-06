"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HardDrive, Loader2 } from "lucide-react";

const mb = (bytes: number) => `${Math.round(bytes / 1e6).toLocaleString()} MB`;

/**
 * Runs /api/review/reclaim: deletes stored images of finished drafts and
 * compacts the database, then says how much space came back.
 */
export function FreeDiskButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (
      !window.confirm(
        "Free up disk space? This deletes the stored images of blogs that are already published, cleared or rejected (Shopify keeps its own copy of published ones), then compacts the database. Blogs still in Ready keep their images. It can take a minute; don't close the page.",
      )
    ) {
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/review/reclaim", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        drafts?: number;
        beforeBytes?: number;
        afterBytes?: number;
      };
      if (!res.ok) throw new Error(data.error ?? `Failed (HTTP ${res.status})`);
      setMessage({
        ok: true,
        text: `Done: images removed from ${data.drafts ?? 0} blog(s). Database ${mb(data.beforeBytes ?? 0)} → ${mb(data.afterBytes ?? 0)}.`,
      });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {message && (
        <span
          className={`max-w-[320px] text-[11px] ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
        >
          {message.text}
        </span>
      )}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        title="Delete stored images of finished blogs and give the space back to the database volume"
        aria-busy={pending}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 py-1.5 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 size={13} className="animate-spin" /> : <HardDrive size={13} />}
        {pending ? "Freeing space…" : "Free up disk space"}
      </button>
    </span>
  );
}
