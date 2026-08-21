// Imaging agent (pipeline stage) — sources a hero image for an article and
// writes SEO/accessibility alt text. Two kinds of source, tried in order:
//   1. AI-GENERATED (Gemini) — a unique, on-topic image, when GEMINI_API_KEY is set
//   2. Unsplash editorial photo — a real, dignified stock photo
//   3. a product photo from the store's CMS (great for buying guides)
// The order (and whether AI runs at all) is overridable so the review page can
// offer "generate a new image" vs "use a stock photo". Always returns something
// when any source is configured, so a piece never ships imageless.

import { searchPhoto } from "@/lib/connectors/unsplash";
import { generateImage } from "@/lib/connectors/gemini-image";
import { completeText, MODELS } from "@/lib/ai/claude";
import { aiEnabled, geminiImageEnabled } from "@/lib/env";

export type ImageSource = "ai" | "unsplash" | "product";

export interface HeroImage {
  /** Hosted URL for stock/product images. Empty for AI images (bytes in base64). */
  url: string;
  alt: string;
  credit?: string;
  /** Raw base64 bytes for an AI-generated image (attached to the CMS on publish). */
  base64?: string;
  mime?: string;
  source: ImageSource;
}

export interface ImageRequest {
  title: string;
  keyword: string;
  /** Optional store-product image lookup (from the CMS adapter). */
  productImage?: (query: string) => Promise<{ url: string; alt: string } | null>;
}

/**
 * Find the best hero image + alt for an article.
 * `prefer` steers the source: "ai" generates a fresh image (falling back to
 * stock only if generation fails); "stock" skips AI and uses a real photo;
 * omitted uses the default order (AI first when configured, else stock/product).
 * Returns null only when no source is configured or all fail.
 */
export async function sourceHeroImage(
  req: ImageRequest,
  opts?: { prefer?: "ai" | "stock" },
): Promise<HeroImage | null> {
  const preferStock = opts?.prefer === "stock";

  // 1. AI-generated first (unless the caller explicitly wants a stock photo).
  if (!preferStock && geminiImageEnabled()) {
    const ai = await generateHeroImage(req).catch(() => null);
    if (ai) return ai;
  }

  // 2. Real stock photo (Unsplash), then a store product photo.
  const query = imageQuery(req.keyword || req.title);
  const photo = await searchPhoto(query).catch(() => null);
  if (photo) {
    return {
      url: photo.url,
      alt: await altText(req.title, photo.description),
      credit: photo.credit,
      source: "unsplash",
    };
  }
  if (req.productImage) {
    const p = await req.productImage(req.keyword || req.title).catch(() => null);
    if (p) return { url: p.url, alt: await altText(req.title, p.alt), source: "product" };
  }

  // 3. If a stock photo was preferred but none was found, fall back to AI.
  if (preferStock && geminiImageEnabled()) {
    const ai = await generateHeroImage(req).catch(() => null);
    if (ai) return ai;
  }

  return null;
}

/** Generate a bespoke hero via Gemini. Null if generation is off or fails. */
async function generateHeroImage(req: ImageRequest): Promise<HeroImage | null> {
  const prompt = await buildImagePrompt(req.title, req.keyword);
  const img = await generateImage(prompt);
  if (!img) return null;
  const alt = await altText(req.title, `a photograph illustrating ${req.keyword || req.title}`);
  return { url: "", base64: img.base64, mime: img.mime, alt, source: "ai" };
}

/**
 * Turn an article into a concrete, tasteful photo brief for the image model.
 * Hard guardrails keep it appropriate for a funeral/casket brand (dignified,
 * never graphic, no faces, no text). Uses a cheap model when available.
 */
async function buildImagePrompt(title: string, keyword: string): Promise<string> {
  const GUARD =
    "Photorealistic editorial photograph, documentary style, soft natural lighting, shallow depth of field. " +
    "Tasteful, respectful, calm. No text, no watermarks, no logos, no human faces, " +
    "nothing graphic or distressing, never a body or a funeral in progress.";
  const fallback = `A tasteful, respectful photograph illustrating an article titled "${title}". ${GUARD}`;
  if (!aiEnabled()) return fallback;
  try {
    const scene = await completeText({
      model: MODELS.ideas,
      cheap: true,
      maxTokens: 120,
      prompt: `In ONE vivid sentence, describe a tasteful real-world PHOTOGRAPH to illustrate a blog article titled "${title}" (topic: ${keyword}), for a funeral/casket retailer. It must be dignified and appropriate — prefer craftsmanship, materials (wood grain, brass), quiet interiors, flowers, or serene nature. Never show a body, a grieving person's face, or a funeral in progress. Reply with only the scene description, no preamble.`,
    });
    return `${(scene || "").trim() || title}. ${GUARD}`;
  } catch {
    return fallback;
  }
}

/** Keep the stock-photo search tasteful/generic for a sensitive niche. */
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
