import Link from "next/link";
import { Shell } from "@/components/shell";
import { CategoryPoll } from "@/components/category-poll";
import { CategoryReview } from "@/components/category-review";
import { getCategoryPage } from "@/lib/categories/service";

export const dynamic = "force-dynamic";

export default async function CategoryReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = await getCategoryPage(id);
  if (!page) {
    return (
      <Shell>
        <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-8 text-center text-[13px] text-[var(--muted)]">
          That page isn&apos;t here.{" "}
          <Link href="/categories" className="font-medium text-[var(--accent)]">
            Back to the queue
          </Link>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <CategoryPoll active={page.status === "DRAFTING"} />
      <CategoryReview page={page} />
    </Shell>
  );
}
