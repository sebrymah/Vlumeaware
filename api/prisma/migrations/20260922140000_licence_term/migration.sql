-- A licence term with an end date, so a licensed account can expire on a
-- clock the way a trial does. Previously only the 7-day trial had an end;
-- an approved/licensed account ran indefinitely.
--
-- license_ends_at is the field the access check reads. license_starts_at is
-- recorded for display and audit. Both nullable: null means no fixed term,
-- which is the existing behaviour, so every current account is unaffected.
ALTER TABLE "tenants" ADD COLUMN "license_starts_at" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "license_ends_at" TIMESTAMP(3);

-- The term a licence key grants, applied from redemption. Separate from the
-- key's own expires_at (how long the key stays redeemable).
ALTER TABLE "license_tokens" ADD COLUMN "term_days" INTEGER;
