// Imaging agent (pipeline stage) — sources a tasteful hero image for an article
// and writes SEO/accessibility alt text. Sourcing order:
//   1. Unsplash editorial photo (real, dignified — fits any topic)
//   2. a relevant product photo from the store's CMS (great for buying guides)
// Deliberately NOT AI-generated: synthetic imagery reads poorly for a funeral
// brand and is increasingly distrusted by search engines.

import { searchPhoto } from "@/lib/connectors/unsplash";
import { completeText, MODELS } from "@/lib/ai/claude";
import { aiEnabled } from "@/lib/env";

export interface HeroImage {
  url: string;
  alt: string;
  credit?: string;
}

export interface ImageRequest {
  title: string;
  keyword: string;
  /** Optional store-product image lookup (from the CMS adapter). */
  productImage?: (query: string) => Promise<{ url: string; alt: string } | null>;
}

/** Find the best hero image + alt for an article. Returns null if no source
 *  is configured (Unsplash key missing AND no product-image lookup). */
export async function sourceHeroImage(req: ImageRequest): Promise<HeroImage | null> {
  const query = imageQuery(req.keyword || req.title);

  const photo = await searchPhoto(query);
  if (photo) {
    return { url: photo.url, alt: await altText(req.title, photo.description), credit: photo.credit };
  }

  if (req.productImage) {
    const p = await req.productImage(req.keyword || req.title).catch(() => null);
    if (p) return { url: p.url, alt: await altText(req.title, p.alt) };
  }

  return null;
}

/** Keep the search tasteful/generic for a sensitive niche. */
function imageQuery(s: string): string {
  const stripped = s.replace(/\b(cost|price|cheap|vs|near me)\b/gi, "").replace(/\s+/g, " ").trim();
  return stripped || s;
}

/** Descriptive, accessible, lightly topic-aware alt text (~12 words). */
async function altText(articleTitle: string, imageDescription: string): Promise<string> {
  const base = (imageDescription || articleTitle).trim();
  if (!aiEnabled()) return capAlt(base);
  try {
    const out = await completeText({
      model: MODELS.writer,
      maxTokens: 60,
      prompt: `Write ONE concise alt-text line (max ~12 words) for a blog hero image. The image depicts: "${imageDescription}". The article is about: "${articleTitle}". Describe the image accurately for accessibility, reflecting the topic naturally. No surrounding quotes, do not start with "image of".`,
    });
    return capAlt(out || base);
  } catch {
    return capAlt(base);
  }
}

function capAlt(s: string): string {
  const clean = s.replace(/^["']+|["']+$/g, "").replace(/\s+/g, " ").trim();
  return clean.length > 125 ? `${clean.slice(0, 122)}...` : clean;
}
