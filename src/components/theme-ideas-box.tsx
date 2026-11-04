"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Loader2, PlayCircle, AlertTriangle } from "lucide-react";
import { ClosestMatch } from "@/components/closest-match";
import type { ThemeLineResult } from "@/lib/pipeline/themes";

/**
 * "Ideas from my themes & keywords": type themes/keywords (one per line), pick
 * local/evergreen, a pillar and how many titles each; edit and tick the titles
 * you want; ticked titles become blogs (brief → write → grade → Ready).
 */
export function ThemeIdeasBox({ pillars }: { pillars: { id: string; name: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"LOCAL" | "EVERGREEN">("EVERGREEN");
  const [pillarId, setPillarId] = useState("");
  const [perLine, setPerLine] = useState(5);
  const [busy, setBusy] = useState<"suggest" | "use" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<ThemeLineResult[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<{ started: string[]; skipped: { title: string; reason: string }[] } | null>(null);

  async function suggest() {
    setBusy("suggest");
    setError(null);
    setDone(null);
    try {
      const res = await fetch("/api/ideas/themes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: text.split("\n"), kind, pillarId: pillarId || null, perLine }),
      });
      const data = (await res.json()) as { lines?: ThemeLineResult[]; error?: string };
      if (!res.ok || !data.lines) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLines(data.lines);
      setTitles(Object.fromEntries(data.lines.flatMap((l) => l.suggestions.map((s) => [s.id, s.title]))));
      setTicked({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't suggest titles");
    } finally {
      setBusy(null);
    }
  }

  async function useTicked() {
    const picks = Object.entries(ticked)
      .filter(([, on]) => on)
      .map(([id]) => ({ id, title: titles[id] ?? "" }));
    if (!picks.length) return;
    setBusy("use");
    setError(null);
    try {
      const res = await fetch("/api/ideas/themes/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks }),
      });
      const data = (await res.json()) as {
        started?: { title: string }[];
        skipped?: { title: string; reason: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDone({ started: (data.started ?? []).map((s) => s.title), skipped: data.skipped ?? [] });
      setLines(null);
      setTicked({});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start those blogs");
    } finally {
      setBusy(null);
    }
  }

  const tickedCount = Object.values(ticked).filter(Boolean).length;

  return (
    <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Lightbulb size={15} className="text-[var(--accent)]" />
        <h2 className="text-[14px] font-medium">Ideas from my themes &amp; keywords</h2>
      </div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">
        One theme or keyword per line. You get title suggestions for each, every one checked against your
        Shopify posts and everything the engine has made. Edit any title, tick the ones you want, and they
        become blogs. The keyword you typed is the blog&apos;s main target keyword.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={"veteran headstones\nflat granite grave marker cost\nheadstone cleaning"}
        className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
        <div className="flex overflow-hidden rounded-lg border border-[var(--border-strong)]">
          {(["EVERGREEN", "LOCAL"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 ${kind === k ? "bg-[var(--accent)] text-white" : "text-[var(--muted)] hover:bg-[var(--surface-2)]"}`}
            >
              {k === "LOCAL" ? "Local" : "Evergreen"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[var(--muted)]">
          Pillar
          <select
            value={pillarId}
            onChange={(e) => setPillarId(e.target.value)}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1 text-[12px] text-[var(--text)]"
          >
            <option value="">Any</option>
            {pillars.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[var(--muted)]">
          Titles per line
          <input
            type="number"
            min={1}
            max={10}
            value={perLine}
            onChange={(e) => setPerLine(Math.max(1, Math.min(10, Number(e.target.value) || 5)))}
            className="w-14 rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-1 text-[12px] text-[var(--text)]"
          />
        </label>
        <button
          type="button"
          onClick={suggest}
          disabled={busy !== null || !text.trim()}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "suggest" ? <Loader2 size={14} className="animate-spin" /> : <Lightbulb size={14} />}
          {busy === "suggest" ? "Suggesting… (about a minute)" : "Suggest titles"}
        </button>
      </div>

      {error && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[var(--danger)]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      {done && (
        <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2.5 text-[12px]">
          {done.started.length > 0 && (
            <p className="text-[var(--success)]">
              Started {done.started.length} blog{done.started.length === 1 ? "" : "s"}. They show in Pipeline now
              and land in Ready to publish once they pass the quality bar.
            </p>
          )}
          {done.skipped.map((s) => (
            <p key={s.title} className="mt-1 text-[var(--warn)]">
              Not started: “{s.title}”. {s.reason}
            </p>
          ))}
        </div>
      )}

      {lines && (
        <div className="mt-4 space-y-4">
          {lines.map((l) => (
            <div key={l.theme}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                <span className="text-[13px] font-medium">“{l.theme}”</span>
                {l.usedBefore && (
                  <span className="text-[11px] text-[var(--muted)]">
                    used before ({new Date(l.usedBefore.at).toLocaleDateString()}): these avoid the {l.usedBefore.titles}{" "}
                    earlier title{l.usedBefore.titles === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {l.suggestions.length === 0 && (
                <p className="text-[12px] text-[var(--muted)]">No new titles for this one: everything suggested repeated an existing post.</p>
              )}
              <ul className="space-y-1.5">
                {l.suggestions.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-start gap-2 rounded-lg border p-2 ${
                      s.duplicate ? "border-[var(--danger)] bg-[var(--surface-1)]" : "border-[var(--border)] bg-[var(--surface-2)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(ticked[s.id])}
                      onChange={(e) => setTicked((t) => ({ ...t, [s.id]: e.target.checked }))}
                      className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      aria-label={`Use “${titles[s.id] ?? s.title}”`}
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        value={titles[s.id] ?? s.title}
                        onChange={(e) => setTitles((t) => ({ ...t, [s.id]: e.target.value }))}
                        className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[13px] hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none"
                      />
                      <div className="px-1">
                        {s.duplicate && <span className="text-[11px] font-medium text-[var(--danger)]">Likely a repeat · </span>}
                        <ClosestMatch closest={s.closest} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="flex items-center justify-end gap-3">
            <span className="text-[12px] text-[var(--muted)]">{tickedCount} ticked</span>
            <button
              type="button"
              onClick={useTicked}
              disabled={busy !== null || tickedCount === 0}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "use" ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              Write {tickedCount || ""} blog{tickedCount === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
