import Link from "next/link";
import { Shell } from "@/components/shell";
import { getPolishDraft } from "@/lib/data/repo";
import { ReviewEditor } from "./ReviewEditor";

export const dynamic = "force-dynamic";

export default async function ReviewDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draft = await getPolishDraft(id);

  if (!draft) {
    return (
      <Shell>
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-1)] px-4 py-8 text-center">
          <p className="text-[13px] text-[var(--muted)]">
            That draft isn&apos;t here.{" "}
            <Link href="/review" className="font-medium text-[var(--accent)]">
              Back to Review
            </Link>
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ReviewEditor initial={draft} />
    </Shell>
  );
}
