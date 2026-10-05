-- Data fix (owner request, 2026-10-05): Signature Headstones' category-page
-- drafts were downloaded by the operator and are no longer wanted in the
-- Queue. Remove them. Pages marked LIVE (none at the time) are kept. A
-- "Rescan site" on the Queue page would rediscover the collections.
DELETE FROM "CategoryPage"
WHERE "status" <> 'LIVE'
  AND "businessId" IN (
    SELECT "id" FROM "Business" WHERE lower("domain") LIKE '%signatureheadstones.com%'
  );
