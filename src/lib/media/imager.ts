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
  /** Learned steer from operator image feedback ("Avoid … Prefer …"), appended
   *  to the generation prompt so rejections/likes shape future images. */
  steer?: string;
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
  opts?: { prefer?: "ai" | "stock"; aiOnly?: boolean },
): Promise<HeroImage | null> {
  const preferStock = opts?.prefer === "stock";

  // Strict AI: an explicit "generate a new AI image" request. Do NOT fall back
  // to stock — surface the real reason so the UI can show it.
  if (opts?.aiOnly) {
    if (!geminiImageEnabled()) {
      throw new Error(
        "AI image generation isn't enabled — set GEMINI_API_KEY in the environment and redeploy.",
      );
    }
    const ai = await generateHeroImage(req); // throws on API failure
    if (ai) return ai;
    throw new Error("Image generation returned nothing — try again.");
  }

  // 1. AI-generated first (unless the caller explicitly wants a stock photo).
  if (!preferStock && geminiImageEnabled()) {
    const ai = await generateHeroImage(req).catch((e) => {
      console.error("[imager] AI generation failed, falling back:", e instanceof Error ? e.message : e);
      return null;
    });
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
  const prompt = await buildImagePrompt(req.title, req.keyword, req.steer);
  const img = await generateImage(prompt);
  if (!img) return null;
  const alt = await altText(req.title, `a photograph illustrating ${req.keyword || req.title}`);
  return { url: "", base64: img.base64, mime: img.mime, alt, source: "ai" };
}

/**
 * Turn an article into a concrete, tasteful photo brief for the image model.
 * Hard guardrails keep it appropriate for a funeral/casket brand (dignified,
 * never graphic, no faces, no text) AND fight the two failure modes: floating/
 * gravity-defying objects and the plasticky "AI slop" look. `steer` carries the
 * operator's learned feedback. Uses a cheap model to write the scene.
 */
async function buildImagePrompt(title: string, keyword: string, steer?: string): Promise<string> {
  // Realism + composition guardrails — anti-floating, anti-slop, full-frame 16:9.
  const GUARD =
    "Wide 16:9 landscape editorial photograph with the subject shown in FULL, centered, with " +
    "generous breathing room around it — never cropped tight or cut off at the edges. " +
    "Shot as a real photograph on a full-frame DSLR with a 50mm lens, natural realistic lighting " +
    "and physically accurate soft shadows and contact shadows where objects meet surfaces. " +
    "Any main object sits firmly and level on a solid surface — never floating, tilted, or defying " +
    "gravity. True real-world proportions and materials; no warping, no melted or duplicated parts, " +
    "no extra or malformed hardware or limbs. Documentary editorial style, tasteful, respectful, calm. " +
    "Absolutely NO text, watermarks, logos, captions, or UI. No human faces. " +
    "NOT a 3D render, NOT CGI, NOT an illustration or cartoon, no glossy over-saturated 'AI' look — " +
    "it must be indistinguishable from a real professional photograph. " +
    "Nothing graphic or distressing, never a body or a funeral in progress.";
  const steerClause = steer && steer.trim() ? ` ${steer.trim()}` : "";
  const fallback = `A tasteful, respectful, realistic photograph illustrating an article titled "${title}". ${GUARD}${steerClause}`;
  if (!aiEnabled()) return fallback;
  try {
    const scene = await completeText({
      model: MODELS.ideas,
      cheap: true,
      maxTokens: 130,
      prompt: `In ONE vivid sentence, describe a tasteful, realistic real-world PHOTOGRAPH to illustrate a blog article titled "${title}" (topic: ${keyword}), for a funeral/casket retailer.
Choose the single most fitting subject for THIS specific article — it does NOT have to be a casket. Pick whatever best represents the topic, for variety: e.g. a casket or its craftsmanship (wood grain, brass) ONLY when the article is about caskets; otherwise consider white floral arrangements, a serene landscape or soft sky, a hand writing a letter or holding a keepsake, documents or paperwork on a desk, a quiet chapel or memorial interior, lit candles, a peaceful cemetery or headstone, or an urn — whatever genuinely matches the article.
It must be dignified and appropriate, with the subject clearly in a real setting. Never show a body, a grieving person's face, or a funeral in progress. Reply with only the scene description, no preamble.`,
    });
    return `${(scene || "").trim() || title}. ${GUARD}${steerClause}`;
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
