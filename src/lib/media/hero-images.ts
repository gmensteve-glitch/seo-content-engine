// Kill switch for automatic blog hero images (AI generation, stock photos and
// store product photos). OFF unless the HERO_IMAGES env var is exactly "on"
// (owner decision, 2026-11-05: Gemini credits are used up, and no stock-photo
// fallback either). Blogs are still written, graded and reach Ready, just
// without an image. The operator can still upload their own image on the
// review page or pick one already in the draft's gallery.

export function heroImagesEnabled(): boolean {
  return process.env.HERO_IMAGES === "on";
}

export const HERO_IMAGES_OFF =
  "Image generation is turned off for this engine (no AI images and no stock photos). Upload your own image, or add one in Shopify.";
