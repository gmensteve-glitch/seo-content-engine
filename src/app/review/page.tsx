import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill, Bar } from "@/components/ui";
import { getNeedsPolish } from "@/lib/data/repo";
import { polishAndRegradeAction, saveDraftBodyAction } from "@/app/actions";
import { Sparkles, AlertCircle, PenLine, RefreshCw, Save } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const drafts = await getNeedsPolish();

  return (
    <Shell>
      <PageHeader
        title="Needs your experience"
        subtitle="Near-miss drafts that cleared everything the AI can do on its own. Add real first-hand detail — a price you've seen, a real scenario, a verified source — then re-grade to push them over the bar and into the calendar."
      />

      {drafts.length === 0 && (
        <Card>
          <p className="text-[13px] text-[var(--muted)]">
            Nothing waiting for polish. Drafts that fall just short of the quality
            bar land here with the grader&apos;s notes on exactly what to add.
          </p>
        </Card>
      )}

      <div className="space-y-5">
        {drafts.map((d) => {
          const gap = d.threshold - d.overall;
          const weak = d.dimensions
            .filter((dim) => dim.score < dim.max)
            .sort((a, b) => a.score / a.max - b.score / b.max);
          return (
            <Card key={d.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-medium">{d.title}</h2>
                  <div className="mt-1 text-[12px] text-[var(--muted)]">{d.targetKeyword}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <div>
                    <div className="text-[22px] font-semibold leading-none">
                      {d.overall}
                      <span className="text-[13px] font-normal text-[var(--muted)]">
                        /{d.threshold}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--warn)]">
                      {gap > 0 ? `${gap} to go` : "ready"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Weakest dimensions */}
              {weak.length > 0 && (
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {weak.slice(0, 4).map((dim) => {
                    const pct = (dim.score / dim.max) * 100;
                    const tone = pct < 50 ? "danger" : pct < 80 ? "warn" : "success";
                    return (
                      <div key={dim.key} className="flex items-center gap-2">
                        <span className="w-32 shrink-0 text-[11.5px] text-[var(--muted)]">
                          {dim.label}
                        </span>
                        <Bar pct={pct} tone={tone} />
                        <span className="w-9 shrink-0 text-right text-[11px] tabular-nums">
                          {dim.score}/{dim.max}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* What to add (experience callouts) */}
              {d.experienceNotes.length > 0 && (
                <div className="mt-3 rounded-lg border border-[var(--accent-bg)] bg-[var(--accent-bg)] px-3 py-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">
                    <Sparkles size={13} /> Add your experience
                  </div>
                  <ul className="space-y-1">
                    {d.experienceNotes.map((n, i) => (
                      <li key={i} className="text-[12.5px] text-[var(--text)]">
                        · {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Grader feedback */}
              {d.feedback && (
                <div className="mt-3 flex gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-[var(--warn)]" />
                  <p className="text-[12.5px] leading-relaxed text-[var(--text)]">{d.feedback}</p>
                </div>
              )}

              {/* Editable body + actions */}
              <form className="mt-3">
                <input type="hidden" name="draftId" value={d.id} />
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
                  <PenLine size={13} /> Draft (Markdown) — edit in place
                </div>
                <textarea
                  name="bodyMd"
                  defaultValue={d.bodyMd}
                  spellCheck
                  className="h-80 w-full resize-y rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] p-3 font-mono text-[12px] leading-relaxed"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    formAction={polishAndRegradeAction}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-bg)] px-3 py-2 text-[13px] font-medium text-[var(--accent)]"
                  >
                    <RefreshCw size={14} /> Save &amp; re-grade
                  </button>
                  <button
                    formAction={saveDraftBodyAction}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)]"
                  >
                    <Save size={14} /> Save only
                  </button>
                  <span className="text-[11px] text-[var(--subtle)]">
                    Re-grading passes it straight to the calendar if it clears {d.threshold}.
                  </span>
                </div>
              </form>
            </Card>
          );
        })}
      </div>
    </Shell>
  );
}
