import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getPendingBriefs } from "@/lib/data/repo";
import { Check, X, MapPin, HelpCircle, Tag } from "lucide-react";

export default async function BriefsPage() {
  const briefs = await getPendingBriefs();

  return (
    <Shell>
      <PageHeader
        title="Briefs awaiting your approval"
        subtitle="Your one gate. Approve once — the engine researches, writes, grades, links, and publishes."
      />
      <div className="space-y-4">
        {briefs.map((b) => (
          <Card key={b.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {b.contentType === "geo" && <MapPin size={15} className="text-[var(--accent)]" />}
                  <h2 className="text-[15px] font-medium">{b.title}</h2>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--muted)]">
                  <Pill tone="neutral">{b.contentType}</Pill>
                  <span className="flex items-center gap-1">
                    <Tag size={12} /> {b.targetKeyword}
                  </span>
                  <span>· {b.wordTarget.toLocaleString()} words</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button className="flex items-center gap-1.5 rounded-lg bg-[var(--success-bg)] px-3 py-1.5 text-[13px] font-medium text-[var(--success)]">
                  <Check size={14} /> Approve
                </button>
                <button className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[13px] text-[var(--muted)]">
                  <X size={14} /> Skip
                </button>
              </div>
            </div>

            <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--text)]">
              <span className="font-medium">Angle: </span>
              {b.angle}
            </p>

            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
                  <HelpCircle size={13} /> Questions to answer
                </div>
                <ul className="space-y-1">
                  {b.questions.map((q) => (
                    <li key={q} className="text-[12.5px] text-[var(--text)]">
                      · {q}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[var(--muted)]">Schema to include</div>
                <div className="flex flex-wrap gap-1.5">
                  {b.requiredSchema.map((s) => (
                    <Pill key={s} tone="accent">
                      {s}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {briefs.length === 0 && (
          <Card>
            <p className="text-[13px] text-[var(--muted)]">
              No briefs yet. Connect data and generate ideas to produce briefs.
            </p>
          </Card>
        )}
      </div>
    </Shell>
  );
}
