import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getPendingBriefs } from "@/lib/data/repo";
import { approveBriefAction, rejectBriefAction } from "@/app/actions";
import { Check, X, MapPin, HelpCircle, Tag, Target, Code2, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BriefsPage() {
  const briefs = await getPendingBriefs();

  return (
    <Shell>
      <div className="mb-4 flex items-start justify-between gap-4">
        <PageHeader
          title="Briefs to approve"
          subtitle="Your one gate. Approve a winner and the engine writes, grades, links, and readies it automatically — nothing is written until you say yes."
        />
        {briefs.length > 0 && (
          <span className="shrink-0 rounded-full bg-[var(--warn-bg)] px-3 py-1 text-[12px] font-medium text-[var(--warn)]">
            {briefs.length} waiting
          </span>
        )}
      </div>

      {/* One quiet gut-check line, once — not repeated per card. */}
      {briefs.length > 0 && (
        <p className="mb-4 text-[12px] text-[var(--subtle)]">
          Quick check before approving: does the <b>angle</b> match what searchers want · is
          the <b>wedge</b> real · is it <b>on-brand</b>?
        </p>
      )}

      <div className="space-y-4">
        {briefs.map((b) => (
          <Card key={b.id}>
            {/* 1. Title + at-a-glance meta */}
            <div className="flex items-center gap-2">
              {b.contentType === "geo" && <MapPin size={15} className="text-[var(--accent)]" />}
              <h2 className="text-[15.5px] font-semibold">{b.title}</h2>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
              <span className="flex items-center gap-1">
                <Tag size={12} /> {b.targetKeyword}
              </span>
              <span className="text-[var(--subtle)]">·</span>
              <Pill tone="neutral">{b.contentType}</Pill>
              <span className="text-[var(--subtle)]">·</span>
              <span>~{b.wordTarget.toLocaleString()} words</span>
            </div>

            {/* 2. THE WEDGE — the hero. This is what you actually decide on. */}
            <div className="mt-3 rounded-lg border-l-[3px] border-[var(--accent)] bg-[var(--accent-bg)] p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Target size={12} /> The wedge — why this beats what&apos;s ranking now
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--text)]">{b.angle}</p>
            </div>

            {/* 3. Supporting detail — visible but clearly secondary */}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--subtle)]">
                  <HelpCircle size={12} /> Answers these questions
                </div>
                <ul className="space-y-1">
                  {b.questions.map((q) => (
                    <li key={q} className="text-[12.5px] leading-snug text-[var(--muted)]">
                      · {q}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--subtle)]">
                  <Code2 size={12} /> Includes schema
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {b.requiredSchema.map((s) => (
                    <Pill key={s} tone="accent">
                      {s}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. One obvious action, at the end after you've read. */}
            <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
              <form action={approveBriefAction}>
                <input type="hidden" name="briefId" value={b.id} />
                <button className="flex items-center gap-1.5 rounded-lg bg-[var(--success)] px-4 py-2 text-[13px] font-medium text-white hover:brightness-110">
                  <Check size={15} /> Approve
                </button>
              </form>
              <form action={rejectBriefAction}>
                <input type="hidden" name="briefId" value={b.id} />
                <button className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-[13px] text-[var(--muted)] hover:bg-[var(--surface-2)]">
                  <X size={14} /> Skip
                </button>
              </form>
              <span className="ml-1 text-[11.5px] text-[var(--subtle)]">
                Approve → the engine writes &amp; grades it in the background.
              </span>
            </div>
          </Card>
        ))}

        {briefs.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
            <CheckCircle2 size={20} className="mx-auto mb-2 text-[var(--success)]" />
            <p className="text-[13px] text-[var(--muted)]">
              No briefs waiting. Build a brief from the{" "}
              <span className="font-medium text-[var(--accent)]">Ideas</span> box to queue one here.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}
