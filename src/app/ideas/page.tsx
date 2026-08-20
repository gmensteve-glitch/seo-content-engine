import { Shell } from "@/components/shell";
import { PageHeader, Pill } from "@/components/ui";
import { getIdeas, getBusiness, getScoreCalibration } from "@/lib/data/repo";
import {
  buildBriefAction,
  dismissIdeaAction,
  generateIdeasAction,
  setLocalRatioAction,
  setQualityThresholdAction,
} from "@/app/actions";
import { Sparkles, FileText, X, Tag, MapPin, BookOpen, Gauge } from "lucide-react";

export const dynamic = "force-dynamic";

/** Score tier → color + label. Green = strong, blue = good, gray = fair.
 *  (Amber stays reserved for "needs you" elsewhere, so it's not used here.) */
function tier(score: number): {
  label: string;
  pill: "success" | "accent" | "neutral";
  bar: string;
  text: string;
} {
  if (score >= 90)
    return { label: "Strong", pill: "success", bar: "bg-[var(--success)]", text: "text-[var(--success)]" };
  if (score >= 78)
    return { label: "Good", pill: "accent", bar: "bg-[var(--accent)]", text: "text-[var(--accent)]" };
  return { label: "Fair", pill: "neutral", bar: "bg-[var(--border-strong)]", text: "text-[var(--muted)]" };
}

export default async function IdeasPage() {
  const [ideas, business, calibration] = await Promise.all([
    getIdeas(),
    getBusiness(),
    getScoreCalibration(),
  ]);
  const localRatio = business.localRatio;
  const qualityThreshold = business.qualityThreshold;
  const localCount = ideas.filter((i) => i.kind === "LOCAL").length;

  return (
    <Shell>
      <div className="mb-5 flex items-start justify-between gap-4">
        <PageHeader
          title="Idea box"
          subtitle="Scored for opportunity, best first. Pick a strong one and Build a brief. Generating adds a fresh batch — it never replaces what's here."
        />
        <form action={generateIdeasAction}>
          <button className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110">
            <Sparkles size={15} /> Generate ideas
          </button>
        </form>
      </div>

      {/* Content mix — local vs evergreen ratio that steers the whole pipeline */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
          Content mix
          <span className="ml-auto font-normal normal-case tracking-normal text-[11px] text-[var(--muted)]">
            steers idea generation + auto-advance
          </span>
        </div>
        <form action={setLocalRatioAction} className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)]">
            <MapPin size={13} /> Local {localRatio}%
          </span>
          <input
            type="range"
            name="localRatio"
            min={0}
            max={100}
            step={5}
            defaultValue={localRatio}
            className="h-1.5 min-w-[180px] flex-1 accent-[var(--accent)]"
          />
          <span className="flex items-center gap-1 text-[12.5px] text-[var(--muted)]">
            <BookOpen size={13} /> Evergreen {100 - localRatio}%
          </span>
          <button className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110">
            Save mix
          </button>
        </form>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          New ideas are generated to this split, and the pipeline advances whichever kind is behind
          target. In the box now: {localCount} local · {ideas.length - localCount} evergreen.
        </p>
      </div>

      {/* Quality bar — the score a piece must hit to reach Ready */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
          <Gauge size={13} /> Quality bar
          <span className="ml-auto font-normal normal-case tracking-normal text-[11px] text-[var(--muted)]">
            min score to reach Ready
          </span>
        </div>
        <form action={setQualityThresholdAction} className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] font-medium text-[var(--success)]">{qualityThreshold}/100</span>
          <input
            type="range"
            name="threshold"
            min={50}
            max={95}
            step={1}
            defaultValue={qualityThreshold}
            className="h-1.5 min-w-[180px] flex-1 accent-[var(--success)]"
          />
          <button className="rounded-lg bg-[var(--success)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:brightness-110">
            Save bar
          </button>
        </form>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Lower = more pieces reach Ready (you catch weaker ones), higher = only near-perfect
          pieces get through. You picked volume-first — try 70.
        </p>

        {/* Calibration — learns the "good enough" bar from your own decisions */}
        <div className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
          <div className="text-[11px] font-medium text-[var(--muted)]">
            📈 Calibration — what&apos;s actually working
          </div>
          {calibration.acceptedCount > 0 || calibration.rejectedCount > 0 ? (
            <div className="mt-1 text-[11.5px] text-[var(--text)]">
              You&apos;ve accepted <b>{calibration.acceptedCount}</b>
              {calibration.acceptedAvg !== null && ` (avg ${calibration.acceptedAvg}, low ${calibration.acceptedMin})`} and
              rejected <b>{calibration.rejectedCount}</b>
              {calibration.rejectedAvg !== null && ` (avg ${calibration.rejectedAvg})`}.
              {calibration.recommended !== null && (
                <>
                  {" "}
                  Suggested bar: <b className="text-[var(--success)]">{calibration.recommended}</b>.
                  {calibration.recommended !== qualityThreshold && (
                    <form action={setQualityThresholdAction} className="mt-1.5 inline-block">
                      <input type="hidden" name="threshold" value={calibration.recommended} />
                      <button className="rounded-md bg-[var(--success-bg)] px-2 py-1 text-[11px] font-medium text-[var(--success)]">
                        Apply {calibration.recommended}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="mt-1 text-[11.5px] text-[var(--muted)]">{calibration.note}</div>
          )}
        </div>
      </div>

      {/* Color legend */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
        <span className="text-[var(--subtle)]">Opportunity:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" /> Strong 90+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" /> Good 78–89
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" /> Fair &lt;78
        </span>
        <span className="ml-auto text-[var(--subtle)]">{ideas.length} ideas</span>
      </div>

      <div className="space-y-2.5">
        {ideas.map((i) => {
          const t = tier(i.score);
          return (
            <div
              key={i.id}
              className="flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-1)]"
            >
              {/* Left color bar = opportunity strength (scan by color) */}
              <div className={`w-1.5 shrink-0 ${t.bar}`} />

              <div className="flex flex-1 items-center justify-between gap-4 p-3.5">
                {/* Score + content */}
                <div className="flex min-w-0 items-start gap-3.5">
                  <div className="flex w-12 shrink-0 flex-col items-center">
                    <span className={`text-[24px] font-semibold leading-none ${t.text}`}>
                      {i.score}
                    </span>
                    <span className={`mt-1 text-[10px] font-medium ${t.text}`}>{t.label}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium">{i.title}</span>
                      <Pill tone={i.kind === "LOCAL" ? "accent" : "neutral"}>
                        {i.kind === "LOCAL" ? (
                          <>
                            <MapPin size={10} className="mr-1 inline" />
                            Local
                          </>
                        ) : (
                          <>
                            <BookOpen size={10} className="mr-1 inline" />
                            Evergreen
                          </>
                        )}
                      </Pill>
                      <Pill tone="neutral">
                        <Tag size={10} className="mr-1 inline" />
                        {i.pillar}
                      </Pill>
                    </div>
                    {i.rationale && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                        {i.rationale}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions — primary + clearly-visible secondary */}
                <div className="flex shrink-0 items-center gap-2">
                  <form action={buildBriefAction}>
                    <input type="hidden" name="ideaId" value={i.id} />
                    <button className="flex items-center gap-1.5 rounded-lg bg-[var(--accent-bg)] px-3 py-2 text-[13px] font-medium text-[var(--accent)] hover:brightness-110">
                      <FileText size={14} /> Build brief
                    </button>
                  </form>
                  <form action={dismissIdeaAction}>
                    <input type="hidden" name="ideaId" value={i.id} />
                    <button
                      title="Dismiss this idea"
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                    >
                      <X size={14} /> Dismiss
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}

        {ideas.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
            <Sparkles size={20} className="mx-auto mb-2 text-[var(--subtle)]" />
            <p className="text-[13px] text-[var(--muted)]">
              No ideas yet. Hit <span className="font-medium text-[var(--accent)]">Generate ideas</span>{" "}
              to fill the box.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
