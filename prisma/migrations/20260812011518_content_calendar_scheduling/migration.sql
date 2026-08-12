-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Draft_businessId_status_scheduledFor_idx" ON "Draft"("businessId", "status", "scheduledFor");
