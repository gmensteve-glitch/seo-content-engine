// Google Search Console client — your site's real performance data.
// Uses an OAuth access token (per-business, refreshed and stored in the Connector row).
// Docs: https://developers.google.com/webmaster-tools/v1/searchanalytics/query

const BASE = "https://searchconsole.googleapis.com/webmasters/v3";

export interface GscRow {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscQueryOpts {
  siteUrl: string; // e.g. "sc-domain:trustedcaskets.com"
  accessToken: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  dimensions?: ("query" | "page" | "date" | "country" | "device")[];
  rowLimit?: number;
}

export async function searchAnalytics(opts: GscQueryOpts): Promise<GscRow[]> {
  const res = await fetch(
    `${BASE}/sites/${encodeURIComponent(opts.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions ?? ["query"],
        rowLimit: opts.rowLimit ?? 1000,
      }),
    }
  );
  if (!res.ok) throw new Error(`GSC searchAnalytics → HTTP ${res.status}`);

  const data = (await res.json()) as {
    rows?: Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  return (data.rows ?? []).map((r) => ({
    query: r.keys?.[0] ?? "",
    page: r.keys?.[1],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

/** "Striking distance" queries: ranking positions ~11–20 with real impressions. */
export function strikingDistance(rows: GscRow[]): GscRow[] {
  return rows
    .filter((r) => r.position >= 11 && r.position <= 20 && r.impressions >= 20)
    .sort((a, b) => b.impressions - a.impressions);
}
