// Gemini image generation — creates a custom hero image from a text prompt via
// the Gemini API (generativelanguage.googleapis.com), no external SDK. Returns
// raw base64 image bytes the caller attaches to the CMS (Shopify hosts it on its
// CDN). Degrades to null when GEMINI_API_KEY is absent so imaging falls back to
// a real stock/product photo.
//
// Model is env-overridable (GEMINI_IMAGE_MODEL) because Google's image model
// names move fast; the default is the stable "Nano Banana" flash-image model.
// Docs: https://ai.google.dev/gemini-api/docs/image-generation

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-image";

export interface GeneratedImage {
  base64: string; // raw base64 (no data: prefix)
  mime: string; // e.g. "image/png"
}

export function geminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
}

/**
 * Generate a single image for `prompt`. Returns null on any failure (missing
 * key, API error, no image in the response) so the caller can fall back.
 */
export async function generateImage(prompt: string): Promise<GeneratedImage | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(`${BASE}/${geminiImageModel()}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[gemini-image] HTTP ${res.status} ${detail.slice(0, 200)}`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
    };
    for (const part of data.candidates?.[0]?.content?.parts ?? []) {
      const inline = part.inlineData;
      if (inline?.data) {
        return { base64: inline.data, mime: inline.mimeType || "image/png" };
      }
    }
    console.error("[gemini-image] response contained no image data");
    return null;
  } catch (e) {
    console.error("[gemini-image] request failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
