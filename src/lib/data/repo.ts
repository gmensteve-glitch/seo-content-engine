// Repository layer — the ONLY thing the UI calls for data.
// Currently backed by seeded mock data. When the DB is live, swap each function
// body for a Prisma query; the signatures (and the whole UI) stay identical.

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
import {
  BUSINESSES,
  KPIS,
  PIPELINE,
  IDEAS,
  BRIEFS,
  SCORECARDS,
  LIVE_PAGES,
  CONNECTORS,
} from "@/lib/mock/seed";

const DEFAULT_BIZ = "trustedcaskets";

export async function getBusinesses(): Promise<BusinessSummary[]> {
  return BUSINESSES;
}

export async function getBusiness(id?: string): Promise<BusinessSummary> {
  return BUSINESSES.find((b) => b.id === id) ?? BUSINESSES[0];
}

export async function getKpis(bizId = DEFAULT_BIZ): Promise<Kpis> {
  return KPIS[bizId] ?? KPIS[DEFAULT_BIZ];
}

export async function getPipeline(bizId = DEFAULT_BIZ): Promise<PipelineCard[]> {
  return PIPELINE[bizId] ?? [];
}

export async function getIdeas(bizId = DEFAULT_BIZ): Promise<IdeaVM[]> {
  return IDEAS[bizId] ?? [];
}

export async function getPendingBriefs(bizId = DEFAULT_BIZ): Promise<BriefVM[]> {
  return BRIEFS[bizId] ?? [];
}

export async function getLatestScorecard(bizId = DEFAULT_BIZ): Promise<ScorecardVM> {
  return SCORECARDS[bizId] ?? SCORECARDS[DEFAULT_BIZ];
}

export async function getLivePages(bizId = DEFAULT_BIZ): Promise<LivePageVM[]> {
  return LIVE_PAGES[bizId] ?? [];
}

export async function getConnectors(bizId = DEFAULT_BIZ): Promise<ConnectorVM[]> {
  return CONNECTORS[bizId] ?? [];
}

/** Column definitions for the pipeline board. */
export const PIPELINE_COLUMNS: { key: PipelineCard["stage"]; label: string }[] = [
  { key: "ideas", label: "Ideas" },
  { key: "briefs", label: "Briefs · needs you" },
  { key: "in_progress", label: "In progress" },
  { key: "scheduled", label: "Scheduled" },
  { key: "live", label: "Live" },
];
