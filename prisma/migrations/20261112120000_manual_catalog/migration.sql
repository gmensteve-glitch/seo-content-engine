-- "No Shopify connection" mode: uploaded product list and pasted post titles
ALTER TABLE "Business" ADD COLUMN "manualCatalog" JSONB;
ALTER TABLE "Business" ADD COLUMN "manualCatalogAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN "manualPosts" JSONB;
