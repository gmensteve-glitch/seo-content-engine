-- AlterTable
ALTER TABLE "Draft" ADD COLUMN "selectedImageId" TEXT;

-- CreateTable
CREATE TABLE "DraftImage" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "mime" TEXT,
    "data" TEXT,
    "url" TEXT,
    "alt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftImage_draftId_createdAt_idx" ON "DraftImage"("draftId", "createdAt");

-- AddForeignKey
ALTER TABLE "DraftImage" ADD CONSTRAINT "DraftImage_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
