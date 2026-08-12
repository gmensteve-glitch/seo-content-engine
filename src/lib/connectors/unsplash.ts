// Unsplash client — sources real, editorial, commercially-safe photos for blog
// hero images. Free tier; key from env. Chosen over AI generation deliberately:
// for a funeral/casket brand, real dignified photography reads far better than
// synthetic imagery (and Google increasingly distrusts AI images).
// Docs: https://unsplash.com/documentation

const BASE = "https://api.unsplash.com";

export interface StockPhoto {
  url: string; // direct image URL (regular size)
  description: string; // what the photo depicts (seeds the alt text)
  credit: string; // photographer attribution (Unsplash guideline)
}

/** Search Unsplash for the best photo matching a query. Returns null if the
 *  key is missing, nothing matches, or the request fails. */
export async function searchPhoto(query: string): Promise<StockPhoto | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `${BASE}/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: Array<{
        urls?: { regular?: string };
        description?: string | null;
        alt_description?: string | null;
        user?: { name?: string };
      }>;
    };
    const hit = data.results?.[0];
    if (!hit?.urls?.regular) return null;
    return {
      url: hit.urls.regular,
      description: hit.description || hit.alt_description || query,
      credit: hit.user?.name ? `Photo by ${hit.user.name} on Unsplash` : "Unsplash",
    };
  } catch {
    return null;
  }
}
