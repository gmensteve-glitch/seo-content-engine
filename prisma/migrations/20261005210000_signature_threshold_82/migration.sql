-- Owner decision (2026-10-05): Signature Headstones' blog pass mark is 82.
-- Near-misses whose best grade already clears it are promoted to Ready the
-- next time the Ready or Overview page loads (promoteQualifyingDrafts).
UPDATE "Business"
SET "qualityThreshold" = 82
WHERE lower("domain") LIKE '%signatureheadstones.com%';
