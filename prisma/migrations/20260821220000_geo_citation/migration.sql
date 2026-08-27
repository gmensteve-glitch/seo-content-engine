-- CreateTable
CREATE TABLE "GeoCitation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "cited" BOOLEAN NOT NULL DEFAULT false,
    "mentioned" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER,

    CONSTRAINT "GeoCitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GeoCitation_businessId_date_idx" ON "GeoCitation"("businessId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GeoCitation_businessId_query_engine_date_key" ON "GeoCitation"("businessId", "query", "engine", "date");

-- AddForeignKey
ALTER TABLE "GeoCitation" ADD CONSTRAINT "GeoCitation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
