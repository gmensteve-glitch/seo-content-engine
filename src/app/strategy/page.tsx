import { Shell } from "@/components/shell";
import { PageHeader, Card, Pill } from "@/components/ui";

const PILLARS = [
  { name: "Immediate steps", desc: "What to do in the first hours/days after a death." },
  { name: "Costs", desc: "Casket, funeral, cremation and burial pricing." },
  { name: "Buying guide", desc: "How to choose caskets — size, material, value." },
  { name: "Local resources", desc: "City/state funeral homes, benefits, regulations." },
  { name: "Eco options", desc: "Green burial, biodegradable caskets." },
];

export default async function StrategyPage() {
  return (
    <Shell>
      <PageHeader
        title="Strategy"
        subtitle="Content pillars keep output varied and on-brand. Ideas rotate through these themes."
      />
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
        Cadence target: 5 posts / week · quality threshold 85 · 4 internal links per page.
      </p>
    </Shell>
  );
}
