-- Idea: target keyword, origin (ENGINE | THEMES), theme, closest-existing match
ALTER TABLE "Idea" ADD COLUMN "targetKeyword" TEXT;
ALTER TABLE "Idea" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'ENGINE';
ALTER TABLE "Idea" ADD COLUMN "theme" TEXT;
ALTER TABLE "Idea" ADD COLUMN "closestTitle" TEXT;
ALTER TABLE "Idea" ADD COLUMN "closestUrl" TEXT;
ALTER TABLE "Idea" ADD COLUMN "closestSource" TEXT;
ALTER TABLE "Idea" ADD COLUMN "closestSimilarity" INTEGER;
ALTER TABLE "Idea" ADD COLUMN "closestCheckedAt" TIMESTAMP(3);

-- Draft: copy-package SEO title + meta description
ALTER TABLE "Draft" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "Draft" ADD COLUMN "metaDescription" TEXT;

-- Every title the themes & keywords box suggested
CREATE TABLE "ThemeSuggestion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "kind" "IdeaKind" NOT NULL DEFAULT 'EVERGREEN',
    "pillarId" TEXT,
    "title" TEXT NOT NULL,
    "closestTitle" TEXT,
    "closestUrl" TEXT,
    "closestSource" TEXT,
    "closestSimilarity" INTEGER,
    "picked" BOOLEAN NOT NULL DEFAULT false,
    "ideaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeSuggestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ThemeSuggestion_businessId_createdAt_idx" ON "ThemeSuggestion"("businessId", "createdAt");
ALTER TABLE "ThemeSuggestion" ADD CONSTRAINT "ThemeSuggestion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
