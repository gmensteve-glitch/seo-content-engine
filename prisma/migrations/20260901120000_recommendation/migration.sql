-- CreateEnum
CREATE TYPE "RecStatus" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "author" TEXT,
    "imageData" TEXT,
    "imageMime" TEXT,
    "status" "RecStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recommendation_businessId_status_createdAt_idx" ON "Recommendation"("businessId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
