-- CreateTable
CREATE TABLE "ImageFeedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "draftId" TEXT,
    "verdict" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImageFeedback_businessId_createdAt_idx" ON "ImageFeedback"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "ImageFeedback" ADD CONSTRAINT "ImageFeedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
