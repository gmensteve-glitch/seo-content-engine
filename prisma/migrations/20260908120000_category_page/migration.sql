-- CreateEnum
CREATE TYPE "CategoryStatus" AS ENUM ('NOT_STARTED', 'DRAFTING', 'DRAFT_READY', 'NEEDS_FIX', 'LIVE', 'NEEDS_REFRESH');

-- CreateTable
CREATE TABLE "CategoryPage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "liveTitle" TEXT,
    "productCount" INTEGER,
    "liveHasContent" BOOLEAN NOT NULL DEFAULT false,
    "lastCrawledAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "tier" INTEGER NOT NULL DEFAULT 2,
    "targetKeyword" TEXT,
    "secondaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CategoryStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "h1" TEXT,
    "intro" TEXT,
    "bodyHtml" TEXT,
    "seoTitle" TEXT,
    "metaDescription" TEXT,
    "faqJsonLd" TEXT,
    "factsJson" TEXT,
    "briefJson" TEXT,
    "overall" INTEGER,
    "gradeNotes" TEXT,
    "factIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fixNotes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "draftedAt" TIMESTAMP(3),
    "liveAt" TIMESTAMP(3),
    "liveSnapshot" TEXT,
    "refreshDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryPage_businessId_handle_key" ON "CategoryPage"("businessId", "handle");

-- CreateIndex
CREATE INDEX "CategoryPage_businessId_status_tier_idx" ON "CategoryPage"("businessId", "status", "tier");

-- AddForeignKey
ALTER TABLE "CategoryPage" ADD CONSTRAINT "CategoryPage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
