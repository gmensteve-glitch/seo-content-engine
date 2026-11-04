// Page-2 ("striking distance") Search Console queries, split by whether the
// store already has a blog post ranking for them.
//
// A query sitting at position 11–20 is a push-to-page-1 opportunity. If one of
// the store's blog posts is already the page Google shows for it, the right move
// is to refresh THAT post ("Needs refresh"), not to write a second post that
// competes with it. Only queries with no ranking post are offered to the
// ideator as new-topic ideas.

import { fetchGscRows, strikingDistance } from "@/lib/connectors/gsc";
import { gscEnabled } from "@/lib/env";

export interface StrikingQuery {
  query: string;
  position: number;
  impressions: number;
}

export interface RankingPost extends StrikingQuery {
  /** The blog post URL Google shows for the query. */
  page: string;
  /** "/blogs/<blog>/<handle>", for matching against stored URLs on any host. */
  path: string;
  pagePosition: number;
}

export interface StrikingSplit {
  connected: boolean;
  /** Page-2 queries no blog post ranks for: fair game for a new post. */
  newTopics: StrikingQuery[];
  /** Page-2 queries a blog post already ranks for: refresh that post instead. */
  existing: RankingPost[];
}

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; split: StrikingSplit }>();

/** "/blogs/news/how-to-x" from any URL on any host, or null if not a blog post. */
export function blogPath(url: string): string | null {
  const m = url.match(/\/blogs\/[^/?#]+\/[^/?#]+/i);
  return m ? m[0].toLowerCase().replace(/\/+$/, "") : null;
}

export async function strikingSplit(businessId: string): Promise<StrikingSplit> {
  const empty: StrikingSplit = { connected: false, newTopics: [], existing: [] };
  if (!gscEnabled()) return empty;
  const hit = cache.get(businessId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.split;

  const [byQuery, byQueryPage] = await Promise.all([
    fetchGscRows(businessId, { days: 28, dimensions: ["query"], rowLimit: 1000 }),
    fetchGscRows(businessId, { days: 28, dimensions: ["query", "page"], rowLimit: 5000 }),
  ]);
  if (!byQuery) return empty;
  // Without the query→page read we can't tell which searches already have a
  // post, so none is offered as a new topic.
  if (!byQueryPage) return { connected: true, newTopics: [], existing: [] };

  // Best-positioned blog post per query.
  const postFor = new Map<string, { page: string; path: string; position: number }>();
  for (const r of byQueryPage) {
    const path = r.page ? blogPath(r.page) : null;
    if (!path) continue;
    const q = r.query.toLowerCase();
    const cur = postFor.get(q);
    if (!cur || r.position < cur.position) postFor.set(q, { page: r.page!, path, position: r.position });
  }

  const split: StrikingSplit = { connected: true, newTopics: [], existing: [] };
  for (const r of strikingDistance(byQuery).slice(0, 40)) {
    const post = postFor.get(r.query.toLowerCase());
    const base = { query: r.query, position: r.position, impressions: r.impressions };
    if (post) split.existing.push({ ...base, page: post.page, path: post.path, pagePosition: post.position });
    else split.newTopics.push(base);
  }
  cache.set(businessId, { at: Date.now(), split });
  return split;
}
