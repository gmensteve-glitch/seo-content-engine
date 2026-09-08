"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  AlertTriangle,
  Clock,
  Loader2,
  Wand2,
  Info,
  X,
  ExternalLink,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { CategoryPageDetailVM } from "@/lib/categories/service";
import { SubmitButton } from "@/components/submit-button";
import {
  draftCategoryAction,
  autoFixCategoryAction,
  fixCategoryAction,
  markCategoryNotLiveAction,
  markCategoryRefreshAction,
  setCategoryStrategyAction,
} from "@/app/categories/actions";

const READ_CSS = `
.cat-read { font-size: 15.5px; line-height: 1.65; color: var(--text); }
.cat-read h2 { font-size: 18px; font-weight: 600; line-height: 1.3; margin: 26px 0 8px; }
.cat-read h3 { font-size: 15.5px; font-weight: 600; margin: 18px 0 6px; }
.cat-read p { margin: 0 0 12px; max-width: 62ch; }
.cat-read ul, .cat-read ol { margin: 0 0 12px 22px; max-width: 62ch; }
.cat-read li { margin-bottom: 5px; }
.cat-read a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.cat-read table { border-collapse: collapse; width: 100%; margin: 8px 0 16px; font-size: 13.5px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.cat-read th { text-align: left; font-weight: 500; color: var(--muted); background: var(--surface-2); padding: 9px 12px; }
.cat-read td { padding: 9px 12px; border-top: 1px solid var(--border); vertical-align: top; }
`;

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={`h-1 rounded-full ${
            s < step ? "bg-[var(--success)]" : s === step ? "bg-[var(--accent)]" : "bg-[var(--border)]"
          }`}
        />
      ))}
    </div>
  );
}

function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
}

export function CategoryReview({ page: p }: { page: CategoryPageDetailVM }) {
  const [fixOpen, setFixOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const hasDraft = Boolean(p.bodyHtml);
  const drafting = p.status === "DRAFTING";
  const issueCount = p.factIssues.length + (p.overall != null && p.overall < p.threshold ? 1 : 0);
  const btn = "flex h-[46px] items-center gap-2 rounded-full px-6 text-[14px] font-semibold";
  const quiet = "flex h-[44px] items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]";

  return (
    <div className="relative -m-6 flex h-[calc(100vh-49px)] flex-col">
      <style>{READ_CSS}</style>

      {/* Scrolling body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <div className="mx-auto flex max-w-[720px] flex-col gap-[18px] pb-8">
          {/* Step header */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-[12px] text-[var(--muted)]">
              <Link href="/categories" className="flex items-center gap-1.5 hover:text-[var(--text)]">
                <ArrowLeft size={13} /> {p.liveTitle ?? p.handle}
              </Link>
              <div>
                <span className="font-medium text-[var(--text)]">Step 1 of 3</span> · Review
              </div>
            </div>
            <Progress step={1} />
          </div>

          {/* Status line */}
          {drafting && (
            <div className="flex items-center gap-2.5 text-[13px] text-[var(--muted)]">
              <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
              Writing — live catalog, plan, draft, editor pass, fact-check, grade. Usually 2–4 minutes. This page updates itself.
            </div>
          )}
          {!drafting && p.status === "NOT_STARTED" && (
            <div className="text-[13px] text-[var(--muted)]">Nothing written yet.</div>
          )}
          {!drafting && p.status === "DRAFT_READY" && (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--success-bg)] px-[11px] py-[5px] text-[12px] font-semibold text-[var(--success)]">
                <Check size={13} strokeWidth={2.5} /> Score {p.overall}
              </span>
              {p.words != null && <span>{p.words.toLocaleString()} words</span>}
              <span>·</span>
              <span>Every price checked against the catalog</span>
              {p.links && (
                <>
                  <span>·</span>
                  <span>
                    {p.links.internal} internal · {p.links.external} authority links
                  </span>
                </>
              )}
            </div>
          )}
          {!drafting && p.status === "NEEDS_FIX" && (
            <div className="rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] px-5 py-4">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--warn)]">
                <AlertTriangle size={16} /> Needs {issueCount} fix{issueCount === 1 ? "" : "es"}
                {p.overall != null && <span className="font-normal opacity-80">· score {p.overall} of {p.threshold}</span>}
              </div>
              <ul className="mt-2 list-disc pl-5 text-[13px] leading-relaxed text-[var(--warn)]">
                {p.factIssues.slice(0, 4).map((i, k) => (
                  <li key={k}>{i}</li>
                ))}
                {p.overall != null && p.overall < p.threshold && p.gradeNotes && (
                  <li>{p.gradeNotes.split(/(?<=[.;])\s+/)[0]}</li>
                )}
              </ul>
            </div>
          )}
          {!drafting && p.status === "LIVE" && (
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-[var(--muted)]">
              <span className="flex items-center gap-1.5 rounded-full bg-[var(--success-bg)] px-[11px] py-[5px] text-[12px] font-semibold text-[var(--success)]">
                <Check size={13} strokeWidth={2.5} /> Live
              </span>
              <span>since {p.liveAt ? new Date(p.liveAt).toLocaleDateString() : "—"}</span>
              <span>·</span>
              <span>refresh due {p.refreshDueAt ? new Date(p.refreshDueAt).toLocaleDateString() : "—"}</span>
              {p.drifted && (
                <span className="rounded-full bg-[var(--warn-bg)] px-[10px] py-[4px] text-[12px] font-medium text-[var(--warn)]">
                  draft changed since it was pasted
                </span>
              )}
            </div>
          )}
          {!drafting && p.status === "NEEDS_REFRESH" && (
            <div className="flex items-center gap-2 text-[13px] text-[var(--danger)]">
              <Clock size={15} /> Due for a refresh — redraft to re-sync prices, then paste the changed blocks.
            </div>
          )}

          {/* The page, as a shopper reads it */}
          {hasDraft ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-12 py-10">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{p.h1}</h1>
              <p className="mt-5 max-w-[62ch] text-[15.5px] leading-[1.65] text-[var(--text)]">{p.intro}</p>
              <div className="mt-6 flex h-16 items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-[12px] tracking-wider text-[var(--subtle)]">
                PRODUCT GRID{p.productCount != null ? ` — ${p.productCount} products` : ""}
              </div>
              <div className="cat-read mt-2" dangerouslySetInnerHTML={{ __html: p.bodyHtml ?? "" }} />
            </div>
          ) : (
            !drafting && (
              <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-16 text-center text-[13px] text-[var(--muted)]">
                Drafting pulls this collection’s live products and prices, plans the page for its keyword, writes it,
                tightens it, checks every number against the catalog, and grades it.
              </div>
            )
          )}

          {/* Fix panel */}
          {fixOpen && hasDraft && !drafting && (
            <div className="rounded-xl border border-[var(--accent)] bg-[var(--surface-1)] p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                <Wand2 size={13} /> Fix something
              </div>
              <p className="mb-3 text-[13px] text-[var(--muted)]">
                Say what to change in plain words. It redrafts this page now. Tick “remember” and the rule applies to every
                future category page and blog.
              </p>
              <form action={fixCategoryAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={p.id} />
                <textarea
                  name="note"
                  rows={3}
                  required
                  autoFocus
                  placeholder="e.g. ‘lead with oversized widths’, ‘don’t mention veneer’, ‘shorter FAQ answers’"
                  className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface-0)] px-3.5 py-3 text-[14px]"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <SubmitButton icon={<Wand2 size={14} />} pendingLabel="Starting…" className={`${btn} bg-[var(--accent)] text-white hover:opacity-90`}>
                    Fix &amp; redraft
                  </SubmitButton>
                  <label className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                    <input type="checkbox" name="remember" className="h-4 w-4" /> Remember this for every page
                  </label>
                  <button type="button" onClick={() => setFixOpen(false)} className="ml-auto text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                    Cancel
                  </button>
                </div>
              </form>
              {p.fixNotes.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-[12.5px] text-[var(--muted)]">
                  {p.fixNotes.map((n, k) => (
                    <li key={k}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action bar — never scrolls away */}
      <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-1)] px-6 py-4">
        <div className="mx-auto flex max-w-[720px] items-center justify-between gap-4">
          <div className="flex items-center gap-[22px]">
            {hasDraft && !drafting && p.status !== "LIVE" && (
              <button type="button" onClick={() => setFixOpen((v) => !v)} className={quiet}>
                <Wand2 size={14} /> Fix something
              </button>
            )}
            {(hasDraft || p.brief) && (
              <button type="button" onClick={() => setDetails(true)} className={quiet}>
                <Info size={14} /> Details
              </button>
            )}
            {p.status === "LIVE" && (
              <a href={p.url} target="_blank" rel="noreferrer" className={quiet}>
                <ExternalLink size={14} /> View live page
              </a>
            )}
          </div>
          <div className="flex items-center gap-3">
            {p.status === "DRAFT_READY" && (
              <Link href={`/categories/${p.id}/paste`} className={`${btn} bg-[var(--success)] text-white hover:brightness-110`}>
                Looks good — paste it <ArrowRight size={15} />
              </Link>
            )}
            {p.status === "NEEDS_FIX" && (
              <form action={autoFixCategoryAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Wand2 size={15} />} pendingLabel="Starting…" className={`${btn} bg-[var(--accent)] text-white hover:opacity-90`}>
                  Fix these
                </SubmitButton>
              </form>
            )}
            {(p.status === "NOT_STARTED" || p.status === "NEEDS_REFRESH") && (
              <form action={draftCategoryAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Sparkles size={15} />} pendingLabel="Starting…" className={`${btn} bg-[var(--accent)] text-white hover:opacity-90`}>
                  {p.status === "NEEDS_REFRESH" ? "Refresh this page" : "Draft this page"}
                </SubmitButton>
              </form>
            )}
            {p.status === "LIVE" && (
              <form action={markCategoryRefreshAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton icon={<Clock size={14} />} className={`${btn} border border-[var(--border-strong)] text-[var(--muted)] hover:bg-[var(--surface-2)]`}>
                  Flag for refresh
                </SubmitButton>
              </form>
            )}
            {drafting && (
              <div className={`${btn} border border-[var(--accent)] text-[var(--accent)]`}>
                <Loader2 size={15} className="animate-spin" /> Writing…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Details drawer */}
      {details && (
        <div className="absolute inset-0 z-20 flex justify-end bg-black/40" onClick={() => setDetails(false)}>
          <div
            className="flex h-full w-[400px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--surface-1)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="text-[15px] font-semibold">Details</div>
              <button type="button" onClick={() => setDetails(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--surface-2)]" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-6 text-[13px]">
              {/* Score */}
              {p.gradeDimensions.length > 0 && (
                <section>
                  <div className="mb-2 flex items-baseline justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Score</div>
                    <div className={`text-[20px] font-semibold ${p.overall != null && p.overall >= p.threshold ? "text-[var(--success)]" : "text-[var(--warn)]"}`}>
                      {p.overall}<span className="text-[12px] font-normal text-[var(--subtle)]"> / {p.threshold} to pass</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {p.gradeDimensions.map((d) => (
                      <div key={d.key}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span>{d.label}</span>
                          <span className="font-mono text-[11.5px] text-[var(--muted)]">
                            {d.score}/{d.max}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div
                            className={`h-full rounded-full ${d.score / d.max >= 0.85 ? "bg-[var(--success)]" : d.score / d.max >= 0.6 ? "bg-[var(--warn)]" : "bg-[var(--danger)]"}`}
                            style={{ width: `${Math.round((d.score / d.max) * 100)}%` }}
                          />
                        </div>
                        {d.note && <div className="mt-1 text-[11.5px] leading-snug text-[var(--subtle)]">{d.note}</div>}
                      </div>
                    ))}
                  </div>
                  {p.gradeNotes && (
                    <p className="mt-3 rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                      {p.gradeNotes}
                    </p>
                  )}
                </section>
              )}

              {/* Fact-check */}
              {hasDraft && (
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Fact-check</div>
                  {p.factIssues.length === 0 ? (
                    <div className="flex items-center gap-2 text-[var(--success)]">
                      <Check size={14} strokeWidth={2.5} /> Every price, link and claim passed
                    </div>
                  ) : (
                    <ul className="list-disc pl-5 text-[var(--warn)]">
                      {p.factIssues.map((i, k) => (
                        <li key={k}>{i}</li>
                      ))}
                    </ul>
                  )}
                  {!p.hasPolicies && (
                    <p className="mt-2 text-[12px] text-[var(--subtle)]">
                      No shipping/returns policy page was readable on the site, so the copy avoids shipping specifics.
                    </p>
                  )}
                </section>
              )}

              {/* Catalog facts */}
              {p.facts && (
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Live catalog</div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <dt className="text-[var(--muted)]">Products</dt>
                    <dd>{p.facts.productCount}</dd>
                    <dt className="text-[var(--muted)]">Prices</dt>
                    <dd>
                      {money(p.facts.priceMin)} – {money(p.facts.priceMax)}
                    </dd>
                    {p.facts.gauges.length > 0 && (
                      <>
                        <dt className="text-[var(--muted)]">Gauges</dt>
                        <dd>{p.facts.gauges.join(", ")}</dd>
                      </>
                    )}
                    {p.facts.widths.length > 0 && (
                      <>
                        <dt className="text-[var(--muted)]">Widths</dt>
                        <dd>{p.facts.widths.join(", ")}</dd>
                      </>
                    )}
                    {p.facts.materials.length > 0 && (
                      <>
                        <dt className="text-[var(--muted)]">Materials</dt>
                        <dd>{p.facts.materials.slice(0, 8).join(", ")}</dd>
                      </>
                    )}
                  </dl>
                  <p className="mt-1.5 text-[11px] text-[var(--subtle)]">Pulled {new Date(p.facts.fetchedAt).toLocaleString()}</p>
                </section>
              )}

              {/* Brief */}
              {p.brief && (
                <section>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Plan</div>
                  <p className="leading-relaxed">{p.brief.angle}</p>
                  {p.brief.keywordVolumes.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-0.5 text-[12.5px] text-[var(--muted)]">
                      {p.brief.keywordVolumes.map((k) => (
                        <li key={k.keyword} className="flex justify-between gap-2">
                          <span>{k.keyword}</span>
                          <span className="font-mono">{k.volume == null ? "—" : `${k.volume.toLocaleString()}/mo`}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ol className="mt-2 list-decimal pl-5 text-[12.5px] text-[var(--muted)]">
                    {p.brief.sections.map((s) => (
                      <li key={s.heading}>{s.heading}</li>
                    ))}
                  </ol>
                  {p.brief.competitorUrls.length > 0 && (
                    <p className="mt-2 text-[11.5px] text-[var(--subtle)]">
                      Benchmarked against {p.brief.competitorUrls.length} competitor category page{p.brief.competitorUrls.length === 1 ? "" : "s"}.
                    </p>
                  )}
                </section>
              )}

              {/* Strategy */}
              <section>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Strategy</div>
                <form action={setCategoryStrategyAction} className="flex flex-col gap-2.5">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="text-[12px] text-[var(--muted)]">
                    Target keyword
                    <input name="targetKeyword" defaultValue={p.targetKeyword ?? ""} className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 text-[13px]" />
                  </label>
                  <label className="text-[12px] text-[var(--muted)]">
                    Depth
                    <select name="tier" defaultValue={p.tier} className="mt-1 h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2.5 text-[13px]">
                      <option value={1}>Hub · 1,500–2,000 words</option>
                      <option value={2}>Sub-collection · 800–1,200</option>
                      <option value={3}>State / colour · 300–500</option>
                    </select>
                  </label>
                  <SubmitButton className="h-9 rounded-md border border-[var(--border-strong)] px-3 text-[12px] hover:bg-[var(--surface-2)]">Save</SubmitButton>
                </form>
              </section>

              {/* Danger-ish actions */}
              {(hasDraft || p.status === "LIVE") && !drafting && (
                <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
                  {p.status !== "LIVE" && (
                    <form action={draftCategoryAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton icon={<Sparkles size={13} />} pendingLabel="Starting…" className="flex h-10 items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                        Redraft from scratch
                      </SubmitButton>
                    </form>
                  )}
                  {p.status === "LIVE" && (
                    <form action={markCategoryNotLiveAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton icon={<Undo2 size={13} />} className="flex h-10 items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--text)]">
                        Mark as not live
                      </SubmitButton>
                    </form>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
