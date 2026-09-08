import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { CategoryPasteWizard } from "@/components/category-paste-wizard";
import { getCategoryPage } from "@/lib/categories/service";

export const dynamic = "force-dynamic";

export default async function CategoryPastePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const page = await getCategoryPage(id);
  if (!page) redirect("/categories");
  if (!page.bodyHtml) redirect(`/categories/${id}`);
  return (
    <Shell>
      <CategoryPasteWizard
        startAtDone={sp.step === "done"}
        id={page.id}
        title={page.liveTitle ?? page.handle}
        h1={page.h1 ?? ""}
        intro={page.intro ?? ""}
        bodyHtml={page.bodyHtml ?? ""}
        seoTitle={page.seoTitle ?? ""}
        metaDescription={page.metaDescription ?? ""}
        faqJsonLd={page.faqJsonLd ?? ""}
      />
    </Shell>
  );
}
