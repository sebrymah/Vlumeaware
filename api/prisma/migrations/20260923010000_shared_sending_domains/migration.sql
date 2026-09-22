-- A second sending method: Vlumeaware-provided shared sending domains. These
-- are platform-owned, already verified with the email provider, and enabled by
-- a client with one click — no DNS to publish. They are stored as ordinary
-- sending_domains rows so the campaign picker, preflight and send path need no
-- special case, but flagged "managed" so they are never re-verified or deleted
-- provider-side (they carry no provider_id) and render read-only in the client.
ALTER TABLE "sending_domains" ADD COLUMN "managed" BOOLEAN NOT NULL DEFAULT false;

-- Optional display name the From shows ("title"), independent of the domain and
-- address the mail is sent from. Overrides the scenario's sender name when set.
ALTER TABLE "sending_domains" ADD COLUMN "sender_name" TEXT;
