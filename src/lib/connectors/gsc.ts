// Google Search Console client — your site's real performance data.
// Auth via a Google service account (see google-auth.ts); the site URL comes
// from the GSC_SITE_URL env var (e.g. "sc-domain:trustedcaskets.com").
// Docs: https://developers.google.com/webmaster-tools/v1/searchanalytics/query

import { getGoogleAccessToken, GSC_SCOPE } from "./google-auth";
import { gscEnabled } from "@/lib/env";

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

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Authenticated query with explicit dates/dimensions — the low-level entry point
 * used by the daily sync (which pulls one day at a time). Returns null when GSC
 * isn't configured so callers degrade gracefully.
 */
export async function gscQuery(opts: {
  startDate: string;
  endDate: string;
  dimensions: GscQueryOpts["dimensions"];
  rowLimit?: number;
}): Promise<GscRow[] | null> {
  if (!gscEnabled()) return null;
  const siteUrl = process.env.GSC_SITE_URL!;
  const accessToken = await getGoogleAccessToken(GSC_SCOPE);
  if (!accessToken) return null;
  return searchAnalytics({
    siteUrl,
    accessToken,
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions,
    rowLimit: opts.rowLimit ?? 1000,
  });
}

/**
 * One-call entry point: authenticate via the service account and pull the last
 * `days` of Search Console data for the configured site. Returns null when GSC
 * isn't configured (no key or no site URL) so callers degrade gracefully.
 */
export async function fetchGscRows(opts?: {
  days?: number;
  dimensions?: GscQueryOpts["dimensions"];
  rowLimit?: number;
}): Promise<GscRow[] | null> {
  if (!gscEnabled()) return null;
  const siteUrl = process.env.GSC_SITE_URL!;
  const accessToken = await getGoogleAccessToken(GSC_SCOPE);
  if (!accessToken) return null;
  return searchAnalytics({
    siteUrl,
    accessToken,
    startDate: isoDaysAgo(opts?.days ?? 28),
    endDate: isoDaysAgo(1), // GSC data lags ~1–2 days; yesterday is the freshest complete day
    dimensions: opts?.dimensions ?? ["query"],
    rowLimit: opts?.rowLimit ?? 1000,
  });
}

/** A page whose traffic dropped sharply between two equal windows — a refresh candidate. */
export interface DecayingPage {
  page: string;
  recentClicks: number;
  priorClicks: number;
  dropPct: number; // 0–100, how far recent fell below prior
}

/**
 * Pages that lost significant traffic recently vs. the preceding equal window.
 * These are the highest-ROI refresh targets — the content already ranks, it's
 * just decaying. Compares the last `window` days against the `window` before it.
 */
export async function decayingPages(opts?: {
  window?: number;
  minPriorClicks?: number;
  minDropPct?: number;
}): Promise<DecayingPage[] | null> {
  if (!gscEnabled()) return null;
  const siteUrl = process.env.GSC_SITE_URL!;
  const accessToken = await getGoogleAccessToken(GSC_SCOPE);
  if (!accessToken) return null;

  const window = opts?.window ?? 28;
  const minPrior = opts?.minPriorClicks ?? 10;
  const minDrop = opts?.minDropPct ?? 25;

  const [recent, prior] = await Promise.all([
    searchAnalytics({
      siteUrl,
      accessToken,
      startDate: isoDaysAgo(window),
      endDate: isoDaysAgo(1),
      dimensions: ["page"],
      rowLimit: 1000,
    }),
    searchAnalytics({
      siteUrl,
      accessToken,
      startDate: isoDaysAgo(window * 2),
      endDate: isoDaysAgo(window + 1),
      dimensions: ["page"],
      rowLimit: 1000,
    }),
  ]);

  const recentByPage = new Map(recent.map((r) => [r.page ?? r.query, r.clicks]));
  const out: DecayingPage[] = [];
  for (const p of prior) {
    const key = p.page ?? p.query;
    if (p.clicks < minPrior) continue;
    const recentClicks = recentByPage.get(key) ?? 0;
    const dropPct = Math.round(((p.clicks - recentClicks) / p.clicks) * 100);
    if (dropPct >= minDrop) {
      out.push({ page: key, recentClicks, priorClicks: p.clicks, dropPct });
    }
  }
  return out.sort((a, b) => b.priorClicks - a.priorClicks);
}
