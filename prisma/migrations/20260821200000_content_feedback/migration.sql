-- CreateTable
CREATE TABLE "ContentFeedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentFeedback_businessId_createdAt_idx" ON "ContentFeedback"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentFeedback" ADD CONSTRAINT "ContentFeedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
