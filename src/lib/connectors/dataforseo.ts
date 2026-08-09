// DataForSEO client — SERP + keyword data. Pay-as-you-go; credentials from env.
// Docs: https://docs.dataforseo.com/v3/ . Responses are loosely typed on purpose;
// we extract only the fields the agents use.

const BASE = "https://api.dataforseo.com/v3";

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function post<T>(path: string, task: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify([task]), // DataForSEO takes an array of tasks
  });
  if (!res.ok) throw new Error(`DataForSEO ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface SerpResult {
  position: number;
  url: string;
  title: string;
  description: string;
}

/** Top organic results for a keyword. */
export async function serpTop(
  keyword: string,
  opts: { locationCode?: number; limit?: number } = {}
): Promise<SerpResult[]> {
  const data = await post<{ tasks?: Array<{ result?: Array<{ items?: unknown[] }> }> }>(
    "/serp/google/organic/live/advanced",
    { keyword, location_code: opts.locationCode ?? 2840, language_code: "en", depth: opts.limit ?? 10 }
  );
  const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
  return items
    .filter((i): i is Record<string, unknown> => !!i && (i as Record<string, unknown>).type === "organic")
    .map((i, idx) => ({
      position: Number(i.rank_absolute ?? idx + 1),
      url: String(i.url ?? ""),
      title: String(i.title ?? ""),
      description: String(i.description ?? ""),
    }));
}

export interface KeywordVolume {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
}

/** Search volume / CPC / competition for a batch of keywords. */
export async function keywordVolumes(
  keywords: string[],
  opts: { locationCode?: number } = {}
): Promise<KeywordVolume[]> {
  const data = await post<{ tasks?: Array<{ result?: Array<Record<string, unknown>> }> }>(
    "/keywords_data/google_ads/search_volume/live",
    { keywords, location_code: opts.locationCode ?? 2840, language_code: "en" }
  );
  const result = data.tasks?.[0]?.result ?? [];
  return result.map((r) => ({
    keyword: String(r.keyword ?? ""),
    volume: r.search_volume != null ? Number(r.search_volume) : null,
    cpc: r.cpc != null ? Number(r.cpc) : null,
    competition: r.competition_index != null ? Number(r.competition_index) : null,
  }));
}
