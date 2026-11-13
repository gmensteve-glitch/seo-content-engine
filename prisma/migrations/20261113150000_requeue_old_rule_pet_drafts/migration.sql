-- Owner request 2026-11-13: rewrite every Overnight Caskets Pets blog that was
-- written under the old rules (in Ready, failed, or already cleared/published
-- with no Page) under the brand-neutral rules, keeping the same titles so the
-- live articles can be updated in place.
--
-- "Old rules" = the draft's brief was built before the brand-neutral rules
-- shipped (commit e9d395e, 2026-11-13 00:26:01 UTC; while the store was paused
-- just before that, no briefs could be built). Briefs built from then on are
-- brand-neutral and get the marker the pipeline now checks (gapMap.generic).

-- 1. Mark brand-neutral briefs so they're never rebuilt.
UPDATE "Brief" b
SET "gapMap" = COALESCE(b."gapMap", '{}'::jsonb) || '{"generic": true}'::jsonb
FROM "Business" biz
WHERE biz."id" = b."businessId"
  AND (lower(biz."domain") LIKE '%pets.overnightcaskets.com%'
    OR lower(biz."domain") LIKE '%overnight-caskets-pets%'
    OR lower(biz."name") = 'overnight caskets pets')
  AND b."createdAt" >= TIMESTAMP '2026-11-13 00:26:01';

-- 2. Re-queue the old-rule drafts: same title, written from scratch (their
--    briefs have no marker, so the pipeline rebuilds them brand-neutral first).
--    refreshedAt marks them as rewrites: they skip the duplicate check (a
--    rewrite keeps its title on purpose) and show as "refreshed" in Ready.
--    Operator-rejected and stopped-as-repeat drafts (rejectedAt set) stay put.
UPDATE "Draft" d
SET "status" = 'RESEARCHING',
    "attempts" = 0,
    "processingStartedAt" = NULL,
    "boostRequestedAt" = NULL,
    "reviewedAt" = NULL,
    "scheduledFor" = NULL,
    "seoTitle" = NULL,
    "metaDescription" = NULL,
    "refreshedAt" = now()
FROM "Brief" b, "Business" biz
WHERE b."id" = d."briefId"
  AND biz."id" = d."businessId"
  AND (lower(biz."domain") LIKE '%pets.overnightcaskets.com%'
    OR lower(biz."domain") LIKE '%overnight-caskets-pets%'
    OR lower(biz."name") = 'overnight caskets pets')
  AND b."createdAt" < TIMESTAMP '2026-11-13 00:26:01'
  AND d."rejectedAt" IS NULL
  AND (
    d."status" IN ('PASSED', 'FAILED')
    OR (d."status" = 'PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "Page" p WHERE p."draftId" = d."id"))
  );

UPDATE "Brief" b
SET "status" = 'APPROVED'
FROM "Draft" d, "Business" biz
WHERE d."briefId" = b."id"
  AND biz."id" = b."businessId"
  AND (lower(biz."domain") LIKE '%pets.overnightcaskets.com%'
    OR lower(biz."domain") LIKE '%overnight-caskets-pets%'
    OR lower(biz."name") = 'overnight caskets pets')
  AND d."status" = 'RESEARCHING'
  AND b."status" <> 'APPROVED';
