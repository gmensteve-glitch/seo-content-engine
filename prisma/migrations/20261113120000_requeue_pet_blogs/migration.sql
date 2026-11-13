-- Owner request 2026-11-13: the brand-neutral blog rules for Overnight Caskets
-- Pets ship with this deploy, so resume its blog writing and re-queue the
-- drafts paused by 20261113090000_pause_pet_blogs. They restart from scratch
-- (their briefs are rebuilt brand-neutral before writing; see
-- runPipelineForBrief / GENERIC_RULES_SINCE).

-- The paused drafts: in progress, brief set back to PENDING_APPROVAL.
UPDATE "Draft" d
SET "status" = 'RESEARCHING',
    "attempts" = 0,
    "processingStartedAt" = NULL
FROM "Brief" b, "Business" biz
WHERE b."id" = d."briefId"
  AND biz."id" = d."businessId"
  AND biz."blogPaused" = true
  AND b."status" = 'PENDING_APPROVAL'
  AND d."status" IN ('RESEARCHING', 'DRAFTED', 'GRADING', 'REVISING');

UPDATE "Brief" b
SET "status" = 'APPROVED'
FROM "Draft" d, "Business" biz
WHERE d."briefId" = b."id"
  AND biz."id" = b."businessId"
  AND biz."blogPaused" = true
  AND b."status" = 'PENDING_APPROVAL'
  AND d."status" = 'RESEARCHING';

UPDATE "Business"
SET "blogPaused" = false
WHERE "blogPaused" = true
  AND (lower("domain") LIKE '%pets.overnightcaskets.com%'
    OR lower("domain") LIKE '%overnight-caskets-pets%'
    OR lower("name") = 'overnight caskets pets');
