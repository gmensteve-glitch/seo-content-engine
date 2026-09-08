// Firecrawl client — extract a live page as clean markdown for competitor analysis.
// Docs: https://docs.firecrawl.dev/ . Free tier available.

const BASE = "https://api.firecrawl.dev/v1";

export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  wordCount: number;
}

export async function scrape(url: string): Promise<ScrapedPage> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY not set");

  // Bounded: a slow scrape must fail the enrichment, never stall a draft.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`Firecrawl scrape ${url} → HTTP ${res.status}`);

  const data = (await res.json()) as {
    data?: { markdown?: string; metadata?: { title?: string } };
  };
  const markdown = data.data?.markdown ?? "";
  return {
    url,
    title: data.data?.metadata?.title ?? "",
    markdown,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
  };
}

/** Scrape several URLs, skipping any that fail. */
export async function scrapeMany(urls: string[]): Promise<ScrapedPage[]> {
  const results = await Promise.allSettled(urls.map(scrape));
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
