"use client";

import { useActionState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateIdeasAction, type GenerateIdeasResult } from "@/app/actions";

/** Generate ideas, with a spinner while the engine thinks (~30–90s) and a line
 *  saying what happened: how many were added, or why proposals were skipped. */
export function GenerateIdeasButton() {
  const [result, action, pending] = useActionState<GenerateIdeasResult, FormData>(generateIdeasAction, null);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {pending ? "Generating… (about a minute)" : "Generate ideas"}
        </button>
      </form>
      {result && !pending && (
        <div
          className={`max-w-[420px] text-right text-[12px] ${result.ok ? "text-[var(--success)]" : "text-[var(--warn)]"}`}
        >
          {result.message}
          {!result.ok && result.skipped && result.skipped.length > 0 && (
            <ul className="mt-1 text-[11px] text-[var(--muted)]">
              {result.skipped.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
