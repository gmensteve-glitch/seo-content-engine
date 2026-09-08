import Link from "next/link";
import { Shell } from "@/components/shell";
import { Card, Pill } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CategoryPoll } from "@/components/category-poll";
import { CategoryPasteView } from "@/components/category-paste-view";
import { getCategoryPage } from "@/lib/categories/service";
import {
  draftCategoryAction,
  fixCategoryAction,
  markCategoryLiveAction,
  markCategoryNotLiveAction,
  markCategoryRefreshAction,
  setCategoryStrategyAction,
} from "@/app/categories/actions";
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Wand2,
  Undo2,
  Loader2,
} from "lucide-react";

export const dynamic = "force-dynamic";

function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${n.toLocaleString("en-US")}`;
}

export default async function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getCategoryPage(id);
  if (!p) {
    return (
      <Shell>
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
          That page isn&apos;t here.{" "}
          <Link href="/categories" className="font-medium text-[var(--accent)]">
            Back to Category pages
          </Link>
        </div>
      </Shell>
    );
  }

  const hasDraft = Boolean(p.bodyHtml);
  const drafting = p.status === "DRAFTING";
  const busyBtn = "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium";

  return (
    <Shell>
      <CategoryPoll active={drafting} />
      <Link href="/categories" className="mb-3 inline-flex items-center gap-1 text-[12px] text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} /> Category pages
      </Link>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight">{p.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--muted)]">
            <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:underline">
              {p.url.replace(/^https?:\/\//, "")} <ExternalLink size={11} />
            </a>
            <span>Tier {p.tier}</span>
            {p.productCount != null && <span>{p.productCount} products</span>}
            {p.liveTitle && p.h1 && p.liveTitle !== p.h1 && <span>live title now: “{p.liveTitle}”</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.status === "LIVE" ? (
            <>
              <form action={markCategoryRefreshAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Clock size={13} />} className={`${busyBtn} border border-[var(--border-strong)] text-[var(--muted)] hover:bg-[var(--surface-2)]`}>
                  Flag for refresh
                </SubmitButton>
              </form>
              <form action={markCategoryNotLiveAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Undo2 size={13} />} className={`${busyBtn} border border-[var(--border-strong)] text-[var(--muted)] hover:bg-[var(--surface-2)]`}>
                  Not live
                </SubmitButton>
              </form>
            </>
          ) : (
            !drafting && (
              <form action={draftCategoryAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton
                  icon={<Sparkles size={13} />}
                  pendingLabel="Starting…"
                  className={`${busyBtn} ${hasDraft ? "border border-[var(--border-strong)] text-[var(--muted)] hover:bg-[var(--surface-2)]" : "bg-[var(--accent)] text-white hover:opacity-90"}`}
                >
                  {hasDraft ? "Redraft from scratch" : "Draft this page"}
                </SubmitButton>
              </form>
            )
          )}
        </div>
      </div>

      {/* Status strip */}
      {drafting && (
        <Card className="mb-4 flex items-center gap-2 border-[var(--accent)] text-[13px]">
          <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
          Writing — pulling the live catalog, planning, drafting, fact-checking and grading. Usually 1–3 minutes. This page updates itself.
        </Card>
      )}
      {p.status === "DRAFT_READY" && (
        <Card className="mb-4 border-[var(--success)] bg-[var(--success-bg)]">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--success)]">
            <CheckCircle2 size={16} />
            <span className="font-medium">Ready to paste.</span>
            <span>
              Grade {p.overall}/{p.threshold} · fact-check passed{p.words ? ` · ${p.words.toLocaleString()} words` : ""}.
            </span>
            <form action={markCategoryLiveAction} className="ml-auto">
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton icon={<CheckCircle2 size={13} />} pendingLabel="Saving…" className={`${busyBtn} bg-[var(--success)] text-white hover:brightness-110`}>
                I pasted it — mark as live
              </SubmitButton>
            </form>
          </div>
        </Card>
      )}
      {p.status === "NEEDS_FIX" && (
        <Card className="mb-4 border-[var(--warn)] bg-[var(--warn-bg)]">
          <div className="flex items-start gap-2 text-[13px] text-[var(--warn)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                Draft needs a fix{p.overall != null ? ` — grade ${p.overall}/${p.threshold}` : ""}.
              </div>
              {p.factIssues.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {p.factIssues.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
              )}
              {p.gradeNotes && <p className="mt-1 text-[12px] opacity-90">{p.gradeNotes}</p>}
              <p className="mt-1.5 text-[12px] opacity-90">Use “Fix it” below to steer a redraft, or redraft from scratch.</p>
            </div>
          </div>
        </Card>
      )}
      {p.status === "LIVE" && (
        <Card className="mb-4 border-[var(--success)]">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <CheckCircle2 size={16} className="text-[var(--success)]" />
            <span className="font-medium text-[var(--success)]">Live</span>
            <span className="text-[var(--muted)]">
              since {p.liveAt ? new Date(p.liveAt).toLocaleDateString() : "—"} · refresh due{" "}
              {p.refreshDueAt ? new Date(p.refreshDueAt).toLocaleDateString() : "—"}
            </span>
            {p.drifted && <Pill tone="warn">draft changed since it was pasted</Pill>}
          </div>
        </Card>
      )}
      {p.status === "NEEDS_REFRESH" && (
        <Card className="mb-4 border-[var(--danger)] bg-[var(--danger-bg)]">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--danger)]">
            <Clock size={16} />
            <span className="font-medium">Due for a refresh.</span>
            <span>Redraft to re-sync prices and update the copy, then paste the changed blocks and mark it live again.</span>
          </div>
        </Card>
      )}
      {p.status === "NOT_STARTED" && !drafting && (
        <Card className="mb-4 text-[13px] text-[var(--muted)]">
          Nothing written yet. Drafting pulls this collection&apos;s live products and prices, plans the page for
          its keyword, writes every block, fact-checks each number against the catalog, and grades it.
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Paste-ready blocks */}
        <div>
          {hasDraft ? (
            <CategoryPasteView
              h1={p.h1 ?? ""}
              intro={p.intro ?? ""}
              bodyHtml={p.bodyHtml ?? ""}
              seoTitle={p.seoTitle ?? ""}
              metaDescription={p.metaDescription ?? ""}
              faqJsonLd={p.faqJsonLd ?? ""}
            />
          ) : (
            !drafting && (
              <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center text-[13px] text-[var(--muted)]">
                The six paste-ready blocks appear here once drafted.
              </div>
            )
          )}

          {/* Fix it */}
          {hasDraft && p.status !== "LIVE" && !drafting && (
            <div className="mt-4 rounded-xl border border-[var(--accent)] bg-[var(--surface-1)] p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Wand2 size={13} /> Fix it
              </div>
              <p className="mb-2 text-[12px] text-[var(--muted)]">
                Tell it what to change — it redrafts this page now. Tick “remember” to apply the rule to every future
                category page (and blog).
              </p>
              <form action={fixCategoryAction} className="space-y-2">
                <input type="hidden" name="id" value={p.id} />
                <textarea
                  name="note"
                  rows={2}
                  required
                  placeholder="e.g. 'lead with oversized widths', 'don't mention veneer', 'shorter FAQ answers'"
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3 py-2 text-[13px]"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <SubmitButton icon={<Wand2 size={13} />} pendingLabel="Starting…" className={`${busyBtn} bg-[var(--accent)] text-white hover:opacity-90`}>
                    Fix &amp; redraft
                  </SubmitButton>
                  <label className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
                    <input type="checkbox" name="remember" /> Remember this for every page
                  </label>
                </div>
              </form>
              {p.fixNotes.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-[12px] text-[var(--muted)]">
                  {p.fixNotes.map((n, k) => (
                    <li key={k}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Side: strategy, facts, brief */}
        <div className="space-y-3">
          <Card>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Strategy</div>
            <form action={setCategoryStrategyAction} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <label className="block text-[12px] text-[var(--muted)]">
                Target keyword
                <input
                  name="targetKeyword"
                  defaultValue={p.targetKeyword ?? ""}
                  className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px]"
                />
              </label>
              <label className="block text-[12px] text-[var(--muted)]">
                Tier
                <select
                  name="tier"
                  defaultValue={p.tier}
                  className="mt-1 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[13px]"
                >
                  <option value={1}>1 · Hub (1,500–2,000 words)</option>
                  <option value={2}>2 · Sub-collection (800–1,200)</option>
                  <option value={3}>3 · Colour / variant (300–500)</option>
                </select>
              </label>
              <SubmitButton className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]">
                Save
              </SubmitButton>
            </form>
            {p.secondaryKeywords.length > 0 && (
              <p className="mt-2 text-[11.5px] text-[var(--muted)]">
                Also targets: {p.secondaryKeywords.join(" · ")}
              </p>
            )}
          </Card>

          {p.facts && (
            <Card>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Live catalog facts
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12.5px]">
                <dt className="text-[var(--muted)]">Products</dt>
                <dd>{p.facts.productCount}</dd>
                <dt className="text-[var(--muted)]">Price range</dt>
                <dd>
                  {money(p.facts.priceMin)} – {money(p.facts.priceMax)}
                </dd>
                {p.facts.gauges.length > 0 && (
                  <>
                    <dt className="text-[var(--muted)]">Gauges</dt>
                    <dd>{p.facts.gauges.join(", ")}</dd>
                  </>
                )}
                {p.facts.materials.length > 0 && (
                  <>
                    <dt className="text-[var(--muted)]">Materials</dt>
                    <dd>{p.facts.materials.slice(0, 8).join(", ")}</dd>
                  </>
                )}
                {p.facts.widths.length > 0 && (
                  <>
                    <dt className="text-[var(--muted)]">Widths</dt>
                    <dd>{p.facts.widths.join(", ")}</dd>
                  </>
                )}
              </dl>
              <p className="mt-2 text-[11px] text-[var(--subtle)]">
                Pulled {new Date(p.facts.fetchedAt).toLocaleString()}. Every number in the copy is checked against this.
              </p>
            </Card>
          )}

          {p.brief && (
            <Card>
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Brief</div>
              <p className="text-[12.5px]">{p.brief.angle}</p>
              {p.brief.keywordVolumes.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[12px] text-[var(--muted)]">
                  {p.brief.keywordVolumes.map((k) => (
                    <li key={k.keyword} className="flex justify-between gap-2">
                      <span>{k.keyword}</span>
                      <span className="font-mono">{k.volume == null ? "—" : `${k.volume.toLocaleString()}/mo`}</span>
                    </li>
                  ))}
                </ul>
              )}
              <ol className="mt-2 list-decimal pl-4 text-[12px] text-[var(--muted)]">
                {p.brief.sections.map((s) => (
                  <li key={s.heading}>{s.heading}</li>
                ))}
              </ol>
              {p.brief.competitorUrls.length > 0 && (
                <p className="mt-2 text-[11px] text-[var(--subtle)]">
                  Benchmarked against {p.brief.competitorUrls.length} competitor category page
                  {p.brief.competitorUrls.length === 1 ? "" : "s"}.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
