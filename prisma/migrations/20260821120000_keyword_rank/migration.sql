-- CreateTable
CREATE TABLE "KeywordRank" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "KeywordRank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordRank_businessId_query_idx" ON "KeywordRank"("businessId", "query");

-- CreateIndex
CREATE UNIQUE INDEX "KeywordRank_businessId_query_date_key" ON "KeywordRank"("businessId", "query", "date");

-- AddForeignKey
ALTER TABLE "KeywordRank" ADD CONSTRAINT "KeywordRank_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
