-- The digest worker had no notion of a tenant being "due": the hourly tick
-- selected every tenant with digest_enabled and sent to all of them, so a
-- feature labelled "weekly digest" in the console would have emailed hourly.
-- Nullable and with no default, so every existing tenant reads as "never
-- sent" and receives one digest on the next tick rather than being silently
-- skipped for a week.
ALTER TABLE "tenants" ADD COLUMN "last_digest_sent_at" TIMESTAMP(3);
