-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processingStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Draft_status_processingStartedAt_idx" ON "Draft"("status", "processingStartedAt");
