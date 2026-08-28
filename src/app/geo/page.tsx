import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getGeoVisibility } from "@/lib/data/repo";
import { runGeoCheckAction } from "@/app/actions";
import { MapPin, Bot, CheckCircle2, Target, Sparkles, RefreshCw } from "lucide-react";

function CheckNowButton({ label }: { label: string }) {
  return (
    <form action={runGeoCheckAction}>
      <button
        type="submit"
        className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[13px] font-medium text-white hover:brightness-110"
      >
        <RefreshCw size={14} /> {label}
      </button>
    </form>
  );
}

export const dynamic = "force-dynamic";

const SAMPLE_CITIES = [
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Houston, TX",
  "Phoenix, AZ",
  "Philadelphia, PA",
];

export default async function GeoPage() {
  const geo = await getGeoVisibility();

  return (
    <Shell>
      <PageHeader
        title="GEO — AI answer visibility"
        subtitle="Are ChatGPT, Perplexity & Google AI citing you when buyers ask? This is ranking inside the LLMs."
      />

      {/* AI Answer Visibility scoreboard */}
      {geo.connected ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--muted)]">
              Checks the answer engines with your target questions. Runs daily — or on demand.
            </span>
            <CheckNowButton label="Re-check now" />
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Citation rate" value={`${geo.citationRate}%`} accent="success" />
            <Stat label="Cited" value={`${geo.citedCount} / ${geo.tested}`} />
            <Stat label="Mentioned" value={`${geo.mentionedCount} / ${geo.tested}`} />
            <Stat
              label="Last checked"
              value={geo.lastCheckedAt ? new Date(geo.lastCheckedAt).toLocaleDateString() : "—"}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--success)]">
                <CheckCircle2 size={14} /> Where AI cites you ({geo.cited.length})
              </div>
              {geo.cited.length ? (
                <div className="space-y-1.5">
                  {geo.cited.map((q) => (
                    <div key={q.query} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate">{q.query}</span>
                      {q.position && (
                        <span className="shrink-0 rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-[10px] text-[var(--success)]">
                          source #{q.position}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--muted)]">Not cited anywhere yet — the list on the right is your target.</p>
              )}
            </Card>

            <Card>
              <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-[var(--warn)]">
                <Target size={14} /> Opportunities — not cited yet ({geo.notCited.length})
              </div>
              {geo.notCited.length ? (
                <div className="space-y-1.5">
                  {geo.notCited.map((q) => (
                    <div key={q.query} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="truncate text-[var(--muted)]">{q.query}</span>
                      {q.mentioned && (
                        <span className="shrink-0 text-[10px] text-[var(--subtle)]">mentioned, not cited</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-[var(--success)]">You&apos;re cited for everything checked. 🎯</p>
              )}
            </Card>
          </div>
        </>
      ) : geo.keyConfigured ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Bot size={20} className="shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">Connected — run your first check</div>
              <p className="mt-1 text-[13px] text-[var(--muted)]">
                Your answer-engine key is wired up. The daily check hasn&apos;t populated yet — click below to ask
                the AI engines your target questions now and see who cites you.
              </p>
            </div>
            <CheckNowButton label="Check now" />
          </div>
        </Card>
      ) : (
        <Card className="mb-4">
          <div className="flex items-start gap-3">
            <Bot size={20} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <div>
              <div className="text-[14px] font-medium">Turn on AI answer tracking</div>
              <p className="mt-1 text-[13px] text-[var(--muted)]">
                Add a <b>Perplexity API key</b> (<span className="text-[var(--subtle)]">PERPLEXITY_API_KEY</span>) and
                the engine asks the AI answer engines your target questions on a schedule, then shows you exactly
                which ones cite Trusted Caskets — and which don&apos;t (your opportunity list). It feeds the gaps
                back to the idea engine automatically.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Pill tone="accent">Tier 1 quotability is already shipping on every new post</Pill>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Local city pages (geographic) */}
      <div className="mt-6 mb-2 flex items-center gap-1.5 text-[12px] font-medium text-[var(--muted)]">
        <Sparkles size={13} /> Local city coverage
      </div>
      <Card>
        <p className="text-[13px] text-[var(--muted)]">
          Local posts target the most populous US metros first — the same city questions AI answers, so winning
          them wins both the map pack and the AI answer.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SAMPLE_CITIES.map((c) => (
            <div
              key={c}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px]"
            >
              <MapPin size={14} className="text-[var(--accent)]" />
              {c}
            </div>
          ))}
        </div>
      </Card>
    </Shell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success";
}) {
  return (
    <div className="rounded-lg bg-[var(--surface-2)] px-3.5 py-3">
      <div className="text-[12px] text-[var(--muted)]">{label}</div>
      <div className={`mt-0.5 text-[22px] font-medium ${accent === "success" ? "text-[var(--success)]" : "text-[var(--text)]"}`}>
        {value}
      </div>
    </div>
  );
}
