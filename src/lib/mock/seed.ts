// Seeded sample data (trustedcaskets.com) so the dashboard renders realistically
// before the database + connectors are live. The repository swaps this for real
// Prisma queries later — the UI never changes.

import type {
  BusinessSummary,
  Kpis,
  PipelineCard,
  IdeaVM,
  BriefVM,
  ScorecardVM,
  LivePageVM,
  ConnectorVM,
} from "@/lib/data/types";

export const BUSINESSES: BusinessSummary[] = [
  {
    id: "trustedcaskets",
    name: "Trusted Caskets",
    short: "TC",
    domain: "trustedcaskets.com",
    cms: "shopify",
    status: "active",
    localRatio: 50,
  },
  {
    id: "overnightcaskets",
    name: "Overnight Caskets",
    short: "OC",
    domain: "overnightcaskets.com",
    cms: "shopify",
    status: "onboarding",
    localRatio: 50,
  },
  {
    id: "demo",
    name: "Demo Co",
    short: "DC",
    domain: "example.com",
    cms: "wordpress",
    status: "paused",
    localRatio: 50,
  },
];

export const KPIS: Record<string, Kpis> = {
  trustedcaskets: {
    livePages: 142,
    indexed: 134,
    clicks28d: 310,
    impressions28d: 24600,
    avgQuality: 91,
    autopilot: true,
  },
  overnightcaskets: {
    livePages: 0,
    indexed: 0,
    clicks28d: 0,
    impressions28d: 0,
    avgQuality: 0,
    autopilot: false,
  },
  demo: {
    livePages: 12,
    indexed: 9,
    clicks28d: 18,
    impressions28d: 1400,
    avgQuality: 82,
    autopilot: false,
  },
};

export const PIPELINE: Record<string, PipelineCard[]> = {
  trustedcaskets: [
    { id: "i1", title: "First 48 hours after a death", stage: "ideas", score: 96 },
    { id: "i2", title: "Cremation vs burial cost", stage: "ideas", score: 94 },
    { id: "i3", title: "How to choose a casket: size, material, price", stage: "ideas", score: 92 },
    { id: "b1", title: "Funeral homes in Austin, TX", stage: "briefs", meta: "geo · vetted", contentType: "geo" },
    { id: "b2", title: "Green burial: cost & where it's allowed", stage: "briefs", meta: "blog", contentType: "blog" },
    { id: "p1", title: "Casket sizes guide", stage: "in_progress", flag: "researching", meta: "researching" },
    { id: "p2", title: "Prepaid funeral plans", stage: "in_progress", flag: "grading", score: 88 },
    { id: "s1", title: "10 questions to ask a funeral director", stage: "scheduled", meta: "in 2 days" },
    { id: "s2", title: "Veteran burial benefits by state", stage: "scheduled", meta: "in 4 days" },
    { id: "s3", title: "What to do when someone dies at home", stage: "scheduled", meta: "in 6 days" },
    { id: "l1", title: "Casket price guide", stage: "live", flag: "boost", meta: "position 11" },
    { id: "l2", title: "Metal vs wood caskets", stage: "live", flag: "rewrite", meta: "low CTR" },
    { id: "l3", title: "Cheapest states to be buried in", stage: "live", flag: "healthy", meta: "position 4" },
  ],
  overnightcaskets: [],
  demo: [],
};

export const IDEAS: Record<string, IdeaVM[]> = {
  trustedcaskets: [
    { id: "i1", title: "First 48 hours after a death", score: 96, pillar: "Immediate steps", rationale: "2,400/mo, very high intent, low competition — grieving families search this first.", kind: "EVERGREEN" as const },
    { id: "i2", title: "Cremation vs burial cost", score: 94, pillar: "Costs", rationale: "High volume comparison; we can win with a material-by-material cost table nobody else has.", kind: "EVERGREEN" as const },
    { id: "i3", title: "How to choose a casket: size, material, price", score: 92, pillar: "Buying guide", rationale: "Directly transactional; ties to product pages.", kind: "EVERGREEN" as const },
    { id: "i4", title: "Veteran burial benefits, state by state", score: 89, pillar: "Local resources", rationale: "Programmatic geo potential; underserved.", kind: "LOCAL" as const },
    { id: "i5", title: "What is a green burial?", score: 85, pillar: "Eco options", rationale: "Growing trend; strong AEO/citation potential.", kind: "EVERGREEN" as const },
  ],
  overnightcaskets: [],
  demo: [],
};

export const BRIEFS: Record<string, BriefVM[]> = {
  trustedcaskets: [
    {
      id: "b1",
      title: "Funeral homes in Austin, TX — a family's guide",
      targetKeyword: "funeral homes austin tx",
      contentType: "geo",
      angle: "Be the trusted local resource: vetted funeral homes (4.4★+), first steps, and costs — not a sales pitch.",
      wordTarget: 1600,
      questions: [
        "How much does a funeral cost in Austin?",
        "What are the best-rated funeral homes near me?",
        "What paperwork is needed when someone dies in Texas?",
      ],
      requiredSchema: ["FAQPage", "LocalBusiness", "HowTo"],
    },
    {
      id: "b2",
      title: "Green burial: what it costs and where it's allowed",
      targetKeyword: "green burial cost",
      contentType: "blog",
      angle: "The only guide that breaks cost down by option AND maps state-by-state legality.",
      wordTarget: 1800,
      questions: [
        "Is green burial cheaper than traditional?",
        "Which states allow home/green burial?",
        "Do you need a casket for a green burial?",
      ],
      requiredSchema: ["FAQPage", "Article"],
    },
  ],
  overnightcaskets: [],
  demo: [],
};

export const SCORECARDS: Record<string, ScorecardVM> = {
  trustedcaskets: {
    draftTitle: "10 questions to ask a funeral director",
    overall: 93,
    passed: true,
    threshold: 85,
    loop: 2,
    dimensions: [
      { key: "intentMatch", label: "Search-intent match", score: 14, max: 15, note: "Directly answers the query in the intro." },
      { key: "depth", label: "Depth vs competitors", score: 13, max: 15, note: "Covers 2 subtopics rivals miss." },
      { key: "eeat", label: "E-E-A-T / experience", score: 12, max: 15, note: "Add one real cost figure or a director quote to reach full marks." },
      { key: "aeo", label: "AEO readiness", score: 15, max: 15, note: "FAQ + HowTo schema valid; passages in citable range." },
      { key: "originality", label: "Originality", score: 9, max: 10, note: "Fresh framing, no slop tells." },
      { key: "linking", label: "Internal linking", score: 10, max: 10, note: "4 relevant links, forward + backward." },
      { key: "readability", label: "Readability & structure", score: 10, max: 10, note: "Clear headings, short paragraphs." },
      { key: "conversion", label: "Conversion", score: 10, max: 10, note: "Soft CTA at top and bottom." },
    ],
    feedback: "Strong. To hit 96: add a first-hand detail under E-E-A-T (a real price range or a quote from a funeral director).",
  },
  overnightcaskets: {
    draftTitle: "—",
    overall: 0,
    passed: false,
    threshold: 85,
    loop: 0,
    dimensions: [],
    feedback: "No drafts yet — connect data and approve a brief to begin.",
  },
  demo: {
    draftTitle: "—",
    overall: 0,
    passed: false,
    threshold: 85,
    loop: 0,
    dimensions: [],
    feedback: "No drafts yet.",
  },
};

export const LIVE_PAGES: Record<string, LivePageVM[]> = {
  trustedcaskets: [
    { id: "l1", title: "Casket price guide", url: "/blogs/guides/casket-price-guide", position: 11, ctr: 1.4, clicks28d: 240, flag: "boost" },
    { id: "l2", title: "Metal vs wood caskets", url: "/blogs/guides/metal-vs-wood-caskets", position: 6, ctr: 0.6, clicks28d: 90, flag: "rewrite" },
    { id: "l3", title: "Cheapest states to be buried in", url: "/blogs/guides/cheapest-states-burial", position: 4, ctr: 3.1, clicks28d: 410, flag: "healthy" },
    { id: "l4", title: "What to do when someone dies", url: "/blogs/guides/what-to-do-when-someone-dies", position: 8, ctr: 2.2, clicks28d: 180, flag: "healthy" },
  ],
  overnightcaskets: [],
  demo: [],
};

export const CONNECTORS: Record<string, ConnectorVM[]> = {
  trustedcaskets: [
    { type: "GSC", label: "Google Search Console", status: "connected", detail: "trustedcaskets.com · synced 2h ago" },
    { type: "DATAFORSEO", label: "DataForSEO", status: "connected", detail: "pay-as-you-go · keyword + SERP" },
    { type: "GA4", label: "Google Analytics 4", status: "disconnected", detail: "optional · conversions" },
    { type: "FIRECRAWL", label: "Firecrawl", status: "connected", detail: "competitor page extraction" },
    { type: "GOOGLE_MAPS", label: "Google Maps", status: "disconnected", detail: "needed for geo pages" },
    { type: "SHOPIFY", label: "Shopify (publish)", status: "connected", detail: "trustedcaskets.myshopify.com" },
  ],
  overnightcaskets: [
    { type: "GSC", label: "Google Search Console", status: "disconnected", detail: "not connected" },
    { type: "DATAFORSEO", label: "DataForSEO", status: "disconnected", detail: "not connected" },
    { type: "SHOPIFY", label: "Shopify (publish)", status: "disconnected", detail: "not connected" },
  ],
  demo: [],
};
