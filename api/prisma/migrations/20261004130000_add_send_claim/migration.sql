-- B5: a claim timestamp so the send worker can mark a row "being sent" before
-- it mails, and set sent_at only after. A retry after a crash between the two
-- then sees the claim and skips, so no recipient is mailed twice. Nullable and
-- additive; no backfill needed.
ALTER TABLE "sends" ADD COLUMN "sending_at" TIMESTAMP(3);
