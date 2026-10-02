-- Data fix: until per-store Search Console, every store's daily sync wrote the
-- one global GSC property's queries (the caskets site's) as its own rankings.
-- Signature Headstones' KeywordRank rows are therefore all casket queries, none
-- its own. Clear them; the next sync refills from its own property.
DELETE FROM "KeywordRank"
WHERE "businessId" IN (
  SELECT "id" FROM "Business" WHERE lower("domain") LIKE '%signatureheadstones.com%'
);
