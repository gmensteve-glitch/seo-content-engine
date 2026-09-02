import Link from "next/link";
import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getOnboardingStatus, getCloneSources } from "@/lib/data/repo";
import { runIntakeAction, cloneSetupAction, seedIdeasAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import {
  Check,
  Fingerprint,
  ShoppingBag,
  Search,
  Sparkles,
  Copy,
  Wand2,
  ArrowRight,
  PartyPopper,
} from "lucide-react";

export const dynamic = "force-dynamic";

function StepShell({
  n,
  done,
  icon,
  title,
  status,
  children,
}: {
  n: number;
  done: boolean;
  icon: React.ReactNode;
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="mb-3">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
            done
              ? "bg-[var(--success-bg)] text-[var(--success)]"
              : "bg-[var(--surface-2)] text-[var(--muted)]"
          }`}
        >
          {done ? <Check size={15} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--accent)]">{icon}</span>
            <h2 className="text-[14.5px] font-medium">{title}</h2>
            {status}
          </div>
          <div className="mt-2.5">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export default async function SetupPage() {
  const [s, sources] = await Promise.all([getOnboardingStatus(), getCloneSources()]);
  const others = sources.filter((b) => b.id !== s.businessId);
  const hasContent = s.ideas + s.writing + s.ready + s.published > 0;

  const steps = [s.hasProfile, s.shopifyConnected, s.gscConnected, hasContent];
  const doneCount = steps.filter(Boolean).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;

  return (
    <Shell>
      <PageHeader
        title={`Set up ${s.name}`}
        subtitle={`Get ${s.domain} generating on-brand content — four steps, mostly automatic.`}
      />

      {/* Progress */}
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {allDone ? (
              <PartyPopper size={18} className="text-[var(--success)]" />
            ) : (
              <Wand2 size={18} className="text-[var(--accent)]" />
            )}
            <span className="text-[14px] font-medium">
              {allDone ? `${s.name} is live and generating.` : `${doneCount} of ${steps.length} steps done`}
            </span>
          </div>
          <span className="text-[12px] text-[var(--muted)]">{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className={`h-full rounded-full ${allDone ? "bg-[var(--success)]" : "bg-[var(--accent)]"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      {/* Step 1 — Brand identity */}
      <StepShell
        n={1}
        done={s.hasProfile}
        icon={<Fingerprint size={15} />}
        title="Brand identity"
        status={
          s.hasProfile ? (
            <Pill tone="success">ready · {s.pillarCount} pillars</Pill>
          ) : (
            <Pill tone="warn">needed</Pill>
          )
        }
      >
        {s.hasProfile ? (
          <div className="space-y-2">
            {s.brandVoice && (
              <p className="text-[12.5px] text-[var(--muted)]">
                <span className="font-medium text-[var(--text)]">Voice:</span> {s.brandVoice}
              </p>
            )}
            {s.profileExcerpt && (
              <p className="line-clamp-2 text-[12px] text-[var(--subtle)]">{s.profileExcerpt}…</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {others.length > 0 && (
                <form action={cloneSetupAction} className="flex items-center gap-2">
                  <select
                    name="sourceId"
                    defaultValue={others[0].id}
                    className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2 py-1 text-[12px]"
                  >
                    {others.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    icon={<Copy size={13} />}
                    pendingLabel="Copying…"
                    className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    Re-copy setup
                  </SubmitButton>
                </form>
              )}
              <form action={runIntakeAction}>
                <SubmitButton
                  icon={<Wand2 size={13} />}
                  pendingLabel="Crawling site…"
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
                >
                  Regenerate from site
                </SubmitButton>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[var(--muted)]">
              Give {s.name} its own profile, voice, and content pillars so its blogs sound like the
              brand — not generic.
            </p>
            {others.length > 0 && (
              <div className="rounded-lg border border-[var(--accent)] bg-[var(--accent-bg)] p-3">
                <div className="mb-1.5 text-[12px] font-medium text-[var(--accent)]">
                  Fastest — copy from an existing store
                </div>
                <p className="mb-2 text-[11.5px] text-[var(--muted)]">
                  If this store is essentially the same business, copy its profile, voice, pillars and
                  settings instantly (connectors and content stay separate).
                </p>
                <form action={cloneSetupAction} className="flex flex-wrap items-center gap-2">
                  <select
                    name="sourceId"
                    defaultValue={others[0].id}
                    className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-0)] px-2 py-1.5 text-[13px]"
                  >
                    {others.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <SubmitButton
                    icon={<Copy size={13} />}
                    pendingLabel="Copying…"
                    className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
                  >
                    Copy setup
                  </SubmitButton>
                </form>
              </div>
            )}
            <div className="rounded-lg border border-[var(--border)] p-3">
              <div className="mb-1.5 text-[12px] font-medium">Or build it from the live site</div>
              <p className="mb-2 text-[11.5px] text-[var(--muted)]">
                We crawl {s.domain} and let AI write the profile, voice, and pillars (~30–60s).
              </p>
              <form action={runIntakeAction}>
                <SubmitButton
                  icon={<Wand2 size={13} />}
                  pendingLabel="Crawling site & writing profile…"
                  className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
                >
                  Generate from site
                </SubmitButton>
              </form>
            </div>
          </div>
        )}
      </StepShell>

      {/* Step 2 — Shopify */}
      <StepShell
        n={2}
        done={s.shopifyConnected}
        icon={<ShoppingBag size={15} />}
        title="Publish target — Shopify"
        status={
          s.shopifyConnected ? <Pill tone="success">connected</Pill> : <Pill tone="warn">needed</Pill>
        }
      >
        {s.shopifyConnected ? (
          <p className="text-[12.5px] text-[var(--muted)]">
            {s.name} publishes to its Shopify blog. Manage it on{" "}
            <Link href="/connectors" className="text-[var(--accent)] hover:underline">
              Connectors
            </Link>
            .
          </p>
        ) : (
          <div>
            <p className="mb-2 text-[12.5px] text-[var(--muted)]">
              Paste this store&apos;s Shopify Admin API token so the engine can publish here.
            </p>
            <Link
              href="/connectors"
              className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90"
            >
              Connect Shopify <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </StepShell>

      {/* Step 3 — Search Console */}
      <StepShell
        n={3}
        done={s.gscConnected}
        icon={<Search size={15} />}
        title="Search Console"
        status={s.gscConnected ? <Pill tone="success">connected</Pill> : <Pill tone="neutral">recommended</Pill>}
      >
        {s.gscConnected ? (
          <p className="text-[12.5px] text-[var(--muted)]">
            Search Console is wired — real rankings + opportunities feed the engine.
          </p>
        ) : (
          <div>
            <p className="mb-2 text-[12.5px] text-[var(--muted)]">
              Connect this store&apos;s property so the engine targets its real page-2 keywords and
              decaying pages. Optional, but it makes everything sharper.
            </p>
            <Link
              href="/connectors"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
            >
              Connect Search Console <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </StepShell>

      {/* Step 4 — First content */}
      <StepShell
        n={4}
        done={hasContent}
        icon={<Sparkles size={15} />}
        title="First content"
        status={
          hasContent ? (
            <Pill tone="success">
              {s.ideas} ideas · {s.writing} writing · {s.ready} ready
            </Pill>
          ) : (
            <Pill tone="neutral">not started</Pill>
          )
        }
      >
        {hasContent ? (
          <p className="text-[12.5px] text-[var(--muted)]">
            The engine is running for {s.name}. Watch it on{" "}
            <Link href="/pipeline" className="text-[var(--accent)] hover:underline">
              Pipeline
            </Link>{" "}
            and review finished pieces in{" "}
            <Link href="/ready" className="text-[var(--accent)] hover:underline">
              Ready
            </Link>
            .
          </p>
        ) : (
          <div>
            <p className="mb-2 text-[12.5px] text-[var(--muted)]">
              The engine tops up ideas automatically, but you can kick off the first batch now.
              {!s.hasProfile && " (Set the brand identity first so they're on-brand.)"}
            </p>
            <form action={seedIdeasAction}>
              <SubmitButton
                icon={<Sparkles size={13} />}
                pendingLabel="Generating ideas…"
                className="flex items-center gap-1.5 rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-[12px] hover:bg-[var(--surface-2)]"
              >
                Generate first ideas
              </SubmitButton>
            </form>
          </div>
        )}
      </StepShell>

      <p className="mt-4 text-[11px] text-[var(--subtle)]">
        Fine-tune the content mix and quality bar anytime on{" "}
        <Link href="/strategy" className="text-[var(--accent)] hover:underline">
          Strategy
        </Link>
        .
      </p>
    </Shell>
  );
}
