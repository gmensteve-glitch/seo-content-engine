// Google Places (Maps) client — vetted local businesses for geo pages.
// Only returns places clearing a quality bar (rating + review count) so geo pages
// never list junk. Docs: https://developers.google.com/maps/documentation/places/web-service

const BASE = "https://places.googleapis.com/v1/places:searchText";

export interface Place {
  name: string;
  address: string;
  rating: number;
  reviewCount: number;
  url?: string;
}

export interface PlacesOpts {
  query: string; // e.g. "funeral homes in Austin, TX"
  minRating?: number; // default 4.4
  minReviews?: number; // default 20
  limit?: number;
}

export async function vettedPlaces(opts: PlacesOpts): Promise<Place[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY not set");

  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.websiteUri",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ textQuery: opts.query, maxResultCount: opts.limit ?? 20 }),
  });
  if (!res.ok) throw new Error(`Google Places → HTTP ${res.status}`);

  const data = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      userRatingCount?: number;
      websiteUri?: string;
    }>;
  };

  const minRating = opts.minRating ?? 4.4;
  const minReviews = opts.minReviews ?? 20;

  return (data.places ?? [])
    .map((p) => ({
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      rating: p.rating ?? 0,
      reviewCount: p.userRatingCount ?? 0,
      url: p.websiteUri,
    }))
    .filter((p) => p.rating >= minRating && p.reviewCount >= minReviews)
    .sort((a, b) => b.rating - a.rating);
}
