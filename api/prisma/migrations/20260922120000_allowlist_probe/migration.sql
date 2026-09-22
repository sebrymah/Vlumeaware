-- Confirming the mail gateway allow-list was a Vlumetech-only tick, so a
-- client admin had no way to clear the gate themselves and it recorded a
-- belief rather than a fact.
--
-- A probe replaces the belief with evidence: a real message sent down the same
-- path a simulation uses, carrying a one-time link. The gate opens only when
-- that link is opened, which can only happen if the message reached an inbox
-- instead of a quarantine.
ALTER TABLE "tenants" ADD COLUMN "allowlist_confirmed_by" TEXT;
ALTER TABLE "tenants" ADD COLUMN "allowlist_probe_token" TEXT;
ALTER TABLE "tenants" ADD COLUMN "allowlist_probe_email" TEXT;
ALTER TABLE "tenants" ADD COLUMN "allowlist_probe_sent_at" TIMESTAMP(3);

-- The token is the only secret in the confirmation link, and it is looked up
-- by this column.
CREATE UNIQUE INDEX "tenants_allowlist_probe_token_key" ON "tenants"("allowlist_probe_token");

-- Everything confirmed before today was confirmed by hand.
UPDATE "tenants" SET "allowlist_confirmed_by" = 'manual'
WHERE "allowlist_confirmed_at" IS NOT NULL;
