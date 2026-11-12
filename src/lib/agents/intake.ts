// The intake agent — runs once per business. Scrapes the site and produces the
// client.md profile, brand voice, and starter content pillars.

import { structured, MODELS } from "@/lib/ai/claude";
import { scrapeMany } from "@/lib/connectors/firecrawl";
import { aiEnabled, firecrawlEnabled } from "@/lib/env";
import { offlineProfile } from "@/lib/ai/offline";

export interface BusinessProfile {
  profileMd: string; // the client.md body
  brandVoice: string;
  pillars: string[];
}

const INTAKE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    profileMd: { type: "string" },
    brandVoice: { type: "string" },
    pillars: { type: "array", items: { type: "string" } },
  },
  required: ["profileMd", "brandVoice", "pillars"],
};

const INTAKE_SYSTEM = `You are an onboarding analyst. From a company's own pages, capture who they are, what they sell, who their audience is, and how they sound — so downstream content agents write on-brand and on-target. Be concrete; infer only what the pages support.`;

/** Shopify's storefront password page ("Opening soon", "Enter store using password"). */
function isPasswordPage(text: string): boolean {
  return /enter (?:the )?store using password|this store is password protected|password protected|\/password\b|opening soon/i.test(text) && text.length < 4000;
}

export async function runIntake(
  domain: string,
  seedPaths: string[] = ["/"],
  /** The store's own data from its Shopify connection (read-only), used when
   *  the public site can't be read: nothing scraped, or only a password page. */
  fallbackCorpus?: () => Promise<string>,
): Promise<BusinessProfile> {
  if (!aiEnabled()) return offlineProfile(domain);

  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const urls = seedPaths.map((p) => new URL(p, base).toString());
  const pages = (firecrawlEnabled() ? await scrapeMany(urls) : []).filter(
    (p) => p.markdown.trim().length > 200 && !isPasswordPage(`${p.title}\n${p.markdown}`),
  );

  let corpus = pages
    .map((p) => `URL: ${p.url}\nTITLE: ${p.title}\n${p.markdown.slice(0, 3000)}`)
    .join("\n\n---\n\n");
  if (!corpus && fallbackCorpus) {
    corpus = await fallbackCorpus().catch((e) => {
      console.error("[intake] Shopify fallback failed:", e instanceof Error ? e.message : e);
      return "";
    });
    if (corpus) corpus = `(The public site is behind a password page; this is the store's own data from Shopify.)\n\n${corpus}`;
  }

  return structured<BusinessProfile>({
    model: MODELS.intake,
    system: INTAKE_SYSTEM,
    schema: INTAKE_SCHEMA,
    prompt: `DOMAIN: ${domain}\n\nSCRAPED PAGES:\n${corpus || "(no pages scraped)"}\n\nProduce:\n- profileMd: a Markdown client profile (business type, products/services, audience, differentiators).\n- brandVoice: 3–5 sentences describing tone and style, with a do/don't.\n- pillars: 4–6 content pillars (themes) to rotate content through.`,
  });
}
