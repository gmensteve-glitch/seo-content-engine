-- AlterTable
ALTER TABLE "Business" ADD COLUMN "policyMd" TEXT,
ADD COLUMN "policyFetchedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CategoryPage" ADD COLUMN "gradeJson" TEXT;
