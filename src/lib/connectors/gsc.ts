// Google Search Console client — your site's real performance data.
// Auth via one shared Google service account (see google-auth.ts). The property
// is PER STORE: the store's own GSC connector (Connectors page) wins; the legacy
// GSC_SITE_URL env var is used only for the store whose domain it names. A store
// with neither gets no Search Console data — never another store's.
// Docs: https://developers.google.com/webmaster-tools/v1/searchanalytics/query

import { getGoogleAccessToken, GSC_SCOPE } from "./google-auth";
import { gscEnabled } from "@/lib/env";
import { prisma, hasDatabase } from "@/lib/db";
import { decryptJson } from "@/lib/crypto/secrets";

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

/** Bare host of a GSC property or domain: "sc-domain:x.com" / "https://www.x.com/" → "x.com". */
function propertyHost(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/**
 * The Search Console property for one store, or null when it has none. The
 * store's connected GSC connector wins; otherwise GSC_SITE_URL, but only when it
 * names this store's own domain (so one store never shows another's rankings).
 */
export async function gscSiteFor(businessId: string): Promise<string | null> {
  if (!gscEnabled() || !hasDatabase) return null;
  const [row, biz] = await Promise.all([
    prisma.connector
      .findUnique({ where: { businessId_type: { businessId, type: "GSC" } } })
      .catch(() => null),
    prisma.business.findUnique({ where: { id: businessId }, select: { domain: true } }).catch(() => null),
  ]);
  if (row?.status === "CONNECTED") {
    try {
      const site = (decryptJson(row.configEnc) as { siteUrl?: unknown }).siteUrl;
      if (typeof site === "string" && site.trim()) return site.trim();
    } catch (e) {
      console.error("[gsc] could not read the store's GSC connector:", e instanceof Error ? e.message : e);
    }
  }
  const env = process.env.GSC_SITE_URL?.trim();
  if (env && biz?.domain && propertyHost(env) === propertyHost(biz.domain)) return env;
  return null;
}

/** Site + token for one store, or null when it has no property / no auth. */
async function gscAuth(businessId: string): Promise<{ siteUrl: string; accessToken: string } | null> {
  const siteUrl = await gscSiteFor(businessId);
  if (!siteUrl) return null;
  const accessToken = await getGoogleAccessToken(GSC_SCOPE);
  if (!accessToken) return null;
  return { siteUrl, accessToken };
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Authenticated query with explicit dates/dimensions — the low-level entry point
 * used by the daily sync (which pulls one day at a time). Returns null when GSC
 * isn't configured so callers degrade gracefully.
 */
export async function gscQuery(businessId: string, opts: {
  startDate: string;
  endDate: string;
  dimensions: GscQueryOpts["dimensions"];
  rowLimit?: number;
}): Promise<GscRow[] | null> {
  const auth = await gscAuth(businessId);
  if (!auth) return null;
  return searchAnalytics({
    ...auth,
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions,
    rowLimit: opts.rowLimit ?? 1000,
  });
}

/**
 * One-call entry point: authenticate via the service account and pull the last
 * `days` of Search Console data for this store's property. Returns null when the
 * store has no property (or no service account) so callers degrade gracefully.
 */
export async function fetchGscRows(businessId: string, opts?: {
  days?: number;
  dimensions?: GscQueryOpts["dimensions"];
  rowLimit?: number;
}): Promise<GscRow[] | null> {
  const auth = await gscAuth(businessId);
  if (!auth) return null;
  return searchAnalytics({
    ...auth,
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
export async function decayingPages(businessId: string, opts?: {
  window?: number;
  minPriorClicks?: number;
  minDropPct?: number;
}): Promise<DecayingPage[] | null> {
  const auth = await gscAuth(businessId);
  if (!auth) return null;

  const window = opts?.window ?? 28;
  const minPrior = opts?.minPriorClicks ?? 10;
  const minDrop = opts?.minDropPct ?? 25;

  const [recent, prior] = await Promise.all([
    searchAnalytics({
      ...auth,
      startDate: isoDaysAgo(window),
      endDate: isoDaysAgo(1),
      dimensions: ["page"],
      rowLimit: 1000,
    }),
    searchAnalytics({
      ...auth,
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
