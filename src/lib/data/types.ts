// View-model types for the dashboard UI. Kept separate from Prisma models so the
// UI stays decoupled from the DB — the repository layer maps DB rows to these.

export type CmsPlatform = "shopify" | "wordpress" | "webflow" | "custom";

export interface BusinessSummary {
  id: string;
  name: string;
  short: string; // 2-letter badge, e.g. "TC"
  domain: string;
  cms: CmsPlatform;
  status: "onboarding" | "active" | "paused";
  localRatio: number; // target % of new content that is local (0–100)
  qualityThreshold: number; // min grade (0–100) a piece must hit to reach Ready
}

export interface PipelineHealthVM {
  ideas: number; // PROPOSED ideas waiting
  briefs: number; // briefs pending approval
  writing: number; // drafts being researched/written/graded
  ready: number; // passed, in the Ready list
  failed: number; // couldn't reach the bar
  published: number; // live
  stuck: number; // drafts held by a stale worker lock (crash mid-run)
  lastActivityAt: string | null; // most recent draft update — "engine breathing"
  engineHealthy: boolean; // pipeline moved in the last ~40 min
  lastActivityLabel: string; // human "12m ago" / "no activity yet"
}

export interface CostSummaryVM {
  count: number; // pieces with recorded cost
  totalCents: number;
  avgCents: number | null; // average cost per blog
  todayCents: number; // spend on pieces created today
  todayCount: number;
  byBand: { band: string; avgCents: number; count: number }[]; // cost by score band
}

export interface GoalDiagnosticsVM {
  total: number; // the goal (e.g. 10)
  localTarget: number;
  everTarget: number;
  readyLocal: number; // ready at the CURRENT bar
  readyEver: number;
  currentBar: number;
  /** A lower bar that would reach the 5+5 goal, or null if the bar isn't the fix. */
  recommendedBar: number | null;
  projectedLocal: number; // ready at the recommended bar
  projectedEver: number;
  /** What's holding you back: nothing (at goal), the bar (too high), or supply. */
  limiting: "none" | "bar" | "supply";
  poolLocal: number; // graded pieces available per kind (supply signal)
  poolEver: number;
}

/** A page-2 keyword we're close to ranking on page 1 for — a content target. */
export interface StrikingKeywordVM {
  query: string;
  position: number; // avg rank (11–20)
  impressions: number; // monthly
  clicks: number;
}

/** A live page losing traffic vs. the prior window — a refresh target. */
export interface DecayingPageVM {
  path: string; // URL path (host stripped)
  dropPct: number; // 0–100
  recentClicks: number;
  priorClicks: number;
}

/** A keyword whose rank moved between two stored snapshots. */
export interface KeywordMoverVM {
  query: string;
  position: number; // latest average rank
  delta: number; // positions improved since prior (positive = climbed up)
  impressions: number; // latest monthly, for weighting
}

/** Rank movement over time, for the Overview "Movers" strip. */
export interface MoversVM {
  hasHistory: boolean; // ≥2 distinct snapshot days exist
  daysSpan: number; // days between the compared snapshots
  climbers: KeywordMoverVM[]; // moved toward page 1, best first
  droppers: KeywordMoverVM[]; // slipping, worst first
}

/** One target question and whether an AI answer engine cited us for it. */
export interface GeoQueryVM {
  query: string;
  cited: boolean;
  mentioned: boolean;
  position: number | null; // rank among cited sources
}

/** GEO (Generative Engine Optimization) visibility — do LLMs cite us? */
export interface GeoVisibilityVM {
  connected: boolean; // an answer-engine key is wired + we have data
  tested: number; // questions checked in the latest run
  citedCount: number;
  mentionedCount: number;
  citationRate: number; // 0–100, cited / tested
  lastCheckedAt: string | null;
  cited: GeoQueryVM[]; // where we ARE cited (wins)
  notCited: GeoQueryVM[]; // where we're NOT cited (the opportunity list)
}

/** Live Search Console opportunities for the Overview panel. */
export interface SeoOpportunitiesVM {
  connected: boolean; // GSC service account wired + returning data
  totalClicks28d: number;
  totalImpressions28d: number;
  striking: StrikingKeywordVM[]; // page-2 money keywords, best first
  decaying: DecayingPageVM[]; // pages to refresh
}

export interface ScoreCalibrationVM {
  acceptedCount: number; // pieces you published or liked
  acceptedAvg: number | null;
  acceptedMin: number | null; // lowest score you were willing to ship
  rejectedCount: number;
  rejectedAvg: number | null;
  recommended: number | null; // data-driven suggested quality bar
  note: string;
}

export interface Kpis {
  livePages: number;
  indexed: number;
  clicks28d: number;
  impressions28d: number;
  avgQuality: number;
  autopilot: boolean;
}

export type PipelineStage =
  | "ideas"
  | "briefs"
  | "in_progress"
  | "review"
  | "scheduled"
  | "live";

export interface PipelineCard {
  id: string;
  title: string;
  stage: PipelineStage;
  meta?: string; // small caption
  score?: number; // quality/idea score
  flag?: "boost" | "rewrite" | "grading" | "researching" | "healthy"; // status accents
  contentType?: "blog" | "landing" | "geo" | "comparison" | "newsletter";
}

export interface IdeaVM {
  id: string;
  title: string;
  score: number;
  pillar: string;
  rationale?: string;
  kind: "LOCAL" | "EVERGREEN";
}

export interface BriefVM {
  id: string;
  title: string;
  targetKeyword: string;
  contentType: "blog" | "landing" | "geo" | "comparison" | "newsletter";
  angle: string;
  wordTarget: number;
  questions: string[];
  requiredSchema: string[];
}

export interface DimensionScoreVM {
  key: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface ScorecardVM {
  draftTitle: string;
  overall: number;
  passed: boolean;
  threshold: number;
  dimensions: DimensionScoreVM[];
  feedback: string;
  loop: number; // which revision loop produced this
}

export interface LivePageVM {
  id: string;
  title: string;
  url: string;
  position?: number;
  ctr?: number;
  clicks28d?: number;
  flag?: "boost" | "rewrite" | "decaying" | "healthy";
}

/** A finished (PASSED) draft sitting in the queue, not yet on the calendar. */
export interface ReadyDraftVM {
  id: string;
  title: string;
  targetKeyword: string;
  overall: number; // latest grade
  wordTarget: number;
  createdAt: string; // ISO
}

/** A draft placed on the content calendar for auto-publish. */
export interface ScheduledItemVM {
  id: string;
  title: string;
  targetKeyword: string;
  overall: number;
  scheduledFor: string; // ISO
  overdue: boolean; // scheduledFor is in the past but not yet published
}

/** A near-miss draft in the human-polish lane: add experience, re-grade, pass. */
export interface PolishDraftVM {
  id: string;
  title: string;
  targetKeyword: string;
  kind: "LOCAL" | "EVERGREEN";
  overall: number;
  threshold: number;
  status: "failed" | "passed";
  bodyMd: string;
  feedback: string;
  dimensions: DimensionScoreVM[];
  /** Which grade version (revision loop) produced this. */
  loop: number;
  /** The writer's "Add your experience" callouts, extracted for a checklist. */
  experienceNotes: string[];
  /** LLM cost to produce this piece, in cents. */
  costCents: number;
  /** Whether a hero image has been chosen/generated for this piece. */
  hasHeroImage: boolean;
  /** How the current hero image was sourced: "ai" | "unsplash" | "product". */
  heroImageSource: string | null;
  updatedAt: string;
}

/** One dot on the month grid — a scheduled future post or an already-live one. */
export interface CalendarEntryVM {
  id: string;
  title: string;
  date: string; // ISO — scheduledFor (scheduled) or publishedAt (published)
  time: string; // "HH:MM" for the chip label
  kind: "published" | "scheduled" | "overdue";
  url?: string; // live URL, when published
}

export interface ConnectorVM {
  type:
    | "GSC"
    | "GA4"
    | "DATAFORSEO"
    | "GOOGLE_MAPS"
    | "FIRECRAWL"
    | "SHOPIFY";
  label: string;
  status: "connected" | "disconnected" | "error";
  detail: string;
}
