import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";
import { getBusiness, getScoreCalibration } from "@/lib/data/repo";
import { setLocalRatioAction, setQualityThresholdAction } from "@/app/actions";
import { SliderForm } from "@/app/ideas/SliderForm";
import { Gauge, SlidersHorizontal } from "lucide-react";

export const dynamic = "force-dynamic";

const PILLARS = [
  { name: "Immediate steps", desc: "What to do in the first hours/days after a death." },
  { name: "Costs", desc: "Casket, funeral, cremation and burial pricing." },
  { name: "Buying guide", desc: "How to choose caskets — size, material, value." },
  { name: "Local resources", desc: "City/state funeral homes, benefits, regulations." },
  { name: "Eco options", desc: "Green burial, biodegradable caskets." },
];

export default async function StrategyPage() {
  const [business, calibration] = await Promise.all([getBusiness(), getScoreCalibration()]);
  const localRatio = business.localRatio;
  const qualityThreshold = business.qualityThreshold;

  return (
    <Shell>
      <PageHeader
        title="Strategy"
        subtitle="The knobs that steer the whole engine — content mix and quality bar drive idea generation, what the pipeline builds next, and what reaches Ready."
      />

      {/* Content mix — local vs evergreen ratio that steers the whole pipeline */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
          <SlidersHorizontal size={13} /> Content mix
          <span className="ml-auto font-normal normal-case tracking-normal text-[11px] text-[var(--muted)]">
            steers idea generation + auto-advance + refresh balance
          </span>
        </div>
        <SliderForm
          action={setLocalRatioAction}
          name="localRatio"
          min={0}
          max={100}
          step={5}
          initial={localRatio}
          variant="mix"
          saveLabel="Save mix"
        />
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          New ideas are generated to this split, and the pipeline fills whichever kind is behind
          target (e.g. 50% → 5 local + 5 evergreen in Ready). Takes effect going forward — it
          doesn&apos;t rebalance pieces already made.
        </p>
      </Card>

      {/* Quality bar — the score a piece must hit to reach Ready */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
          <Gauge size={13} /> Quality bar
          <span className="ml-auto font-normal normal-case tracking-normal text-[11px] text-[var(--muted)]">
            min score to reach Ready
          </span>
        </div>
        <SliderForm
          action={setQualityThresholdAction}
          name="threshold"
          min={50}
          max={95}
          step={1}
          initial={qualityThreshold}
          variant="threshold"
          saveLabel="Save bar"
        />
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Lower = more pieces reach Ready (you catch weaker ones), higher = only near-perfect pieces
          get through.
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
      </Card>

      {/* Pillars — the themes ideas rotate through */}
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--subtle)]">
        Content pillars
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PILLARS.map((p) => (
          <Card key={p.name}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium">{p.name}</span>
              <Pill tone="accent">pillar</Pill>
            </div>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">{p.desc}</p>
          </Card>
        ))}
      </div>
      <p className="mt-5 text-[12px] text-[var(--subtle)]">
        Cadence target: 5 posts / week · quality bar {qualityThreshold} · 4 internal links per page.
      </p>
    </Shell>
  );
}
