-- Blog writing on hold per store (Business.blogPaused).
ALTER TABLE "Business" ADD COLUMN "blogPaused" BOOLEAN NOT NULL DEFAULT false;

-- Owner request 2026-11-13: stop all blog writing for Overnight Caskets Pets
-- now, without deleting anything, until the new writing rules are live.
UPDATE "Business"
SET "blogPaused" = true
WHERE lower("domain") LIKE '%pets.overnightcaskets.com%'
   OR lower("domain") LIKE '%overnight-caskets-pets%'
   OR lower("name") = 'overnight caskets pets';

-- Its queued / in-progress drafts: brief back to not-approved (the worker only
-- picks up drafts whose brief is APPROVED) and any worker lock released.
UPDATE "Brief" b
SET "status" = 'PENDING_APPROVAL'
FROM "Draft" d, "Business" biz
WHERE d."briefId" = b."id"
  AND biz."id" = b."businessId"
  AND biz."blogPaused" = true
  AND b."status" = 'APPROVED'
  AND d."status" IN ('RESEARCHING', 'DRAFTED', 'GRADING', 'REVISING');

UPDATE "Draft" d
SET "processingStartedAt" = NULL
FROM "Business" biz
WHERE biz."id" = d."businessId"
  AND biz."blogPaused" = true
  AND d."status" IN ('RESEARCHING', 'DRAFTED', 'GRADING', 'REVISING');
