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
  overall: number;
  threshold: number;
  status: "failed" | "passed";
  bodyMd: string;
  feedback: string;
  dimensions: DimensionScoreVM[];
  /** The writer's "Add your experience" callouts, extracted for a checklist. */
  experienceNotes: string[];
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
