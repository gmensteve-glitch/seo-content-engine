-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "rejectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DraftFeedback" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftFeedback_draftId_idx" ON "DraftFeedback"("draftId");

-- AddForeignKey
ALTER TABLE "DraftFeedback" ADD CONSTRAINT "DraftFeedback_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
