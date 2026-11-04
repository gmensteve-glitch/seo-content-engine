import { ExternalLink, Copy } from "lucide-react";

const SOURCE: Record<string, string> = {
  shopify: "Shopify post",
  draft: "blog in the engine",
  idea: "idea",
  theme: "earlier suggestion",
};

/** Similarity → color: red = likely repeat, amber = close, gray = distinct. */
function tone(sim: number): string {
  if (sim >= 75) return "text-[var(--danger)]";
  if (sim >= 50) return "text-[var(--warn)]";
  return "text-[var(--muted)]";
}

/** "Closest existing: <title> (Shopify post) · 42% similar" — from the duplicate check. */
export function ClosestMatch({
  closest,
}: {
  closest: { title: string; url?: string; source: string; similarity: number } | null | undefined;
}) {
  if (!closest) {
    return <p className="mt-1 text-[11px] text-[var(--subtle)]">Not checked against existing posts yet.</p>;
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-[var(--muted)]">
      <Copy size={10} className="shrink-0" />
      <span>Closest existing:</span>
      {closest.url ? (
        <a href={closest.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[var(--text)] underline-offset-2 hover:underline">
          {closest.title}
          <ExternalLink size={9} />
        </a>
      ) : (
        <span className="text-[var(--text)]">{closest.title}</span>
      )}
      <span className="text-[var(--subtle)]">({SOURCE[closest.source] ?? closest.source})</span>
      <span className={`font-medium ${tone(closest.similarity)}`}>· {closest.similarity}% similar</span>
    </p>
  );
}
