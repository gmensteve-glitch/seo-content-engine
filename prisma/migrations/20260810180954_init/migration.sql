-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "BizStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "Cms" AS ENUM ('SHOPIFY', 'WORDPRESS', 'WEBFLOW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ConnectorType" AS ENUM ('GSC', 'GA4', 'DATAFORSEO', 'GOOGLE_MAPS', 'SHOPIFY', 'WORDPRESS', 'WEBFLOW');

-- CreateEnum
CREATE TYPE "ConnStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('INFORMATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'NAVIGATIONAL');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('PROPOSED', 'BRIEFED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('BLOG', 'LANDING', 'GEO', 'COMPARISON', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('RESEARCHING', 'DRAFTED', 'GRADING', 'REVISING', 'PASSED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('PUBLISH_QUEUE', 'GSC_SYNC', 'KEYWORD_REFRESH', 'IMPROVE_SWEEP', 'IDEA_GENERATION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "cmsPlatform" "Cms" NOT NULL DEFAULT 'SHOPIFY',
    "profileMd" TEXT,
    "brandVoice" TEXT,
    "status" "BizStatus" NOT NULL DEFAULT 'ONBOARDING',
    "qualityThreshold" INTEGER NOT NULL DEFAULT 85,
    "linksPerPage" INTEGER NOT NULL DEFAULT 4,
    "cadencePerWeek" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "ConnectorType" NOT NULL,
    "configEnc" TEXT NOT NULL,
    "status" "ConnStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pillar" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "volume" INTEGER,
    "intent" "Intent",
    "difficulty" INTEGER,
    "currentPosition" DOUBLE PRECISION,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "pillarId" TEXT,
    "title" TEXT NOT NULL,
    "score" INTEGER,
    "rationale" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brief" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "targetKeyword" TEXT NOT NULL,
    "angle" TEXT,
    "wordTarget" INTEGER,
    "outline" JSONB,
    "questions" JSONB,
    "requiredSchema" TEXT[],
    "gapMap" JSONB,
    "contentType" "ContentType" NOT NULL DEFAULT 'BLOG',
    "status" "BriefStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DraftStatus" NOT NULL DEFAULT 'RESEARCHING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "dimensions" JSONB NOT NULL,
    "feedback" TEXT,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT,
    "url" TEXT NOT NULL,
    "cmsId" TEXT,
    "contentType" "ContentType" NOT NULL DEFAULT 'BLOG',
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagePerformance" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION,
    "conversions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PagePerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkEdge" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,

    CONSTRAINT "LinkEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" "ScheduleType" NOT NULL,
    "cron" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_businessId_key" ON "Membership"("userId", "businessId");

-- CreateIndex
CREATE INDEX "Business_domain_idx" ON "Business"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_businessId_type_key" ON "Connector"("businessId", "type");

-- CreateIndex
CREATE INDEX "Keyword_businessId_phrase_idx" ON "Keyword"("businessId", "phrase");

-- CreateIndex
CREATE UNIQUE INDEX "Brief_ideaId_key" ON "Brief"("ideaId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_briefId_key" ON "Draft"("briefId");

-- CreateIndex
CREATE INDEX "Grade_draftId_idx" ON "Grade"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_draftId_key" ON "Page"("draftId");

-- CreateIndex
CREATE INDEX "Page_businessId_url_idx" ON "Page"("businessId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "PagePerformance_pageId_date_key" ON "PagePerformance"("pageId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LinkEdge_fromId_toId_key" ON "LinkEdge"("fromId", "toId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pillar" ADD CONSTRAINT "Pillar_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "Pillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brief" ADD CONSTRAINT "Brief_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "Brief"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagePerformance" ADD CONSTRAINT "PagePerformance_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEdge" ADD CONSTRAINT "LinkEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEdge" ADD CONSTRAINT "LinkEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
