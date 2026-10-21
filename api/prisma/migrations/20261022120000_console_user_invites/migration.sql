-- Console user invitations and password resets.
--
-- A client admin now creates colleagues, so the person being created has to be
-- able to choose their own password: the admin does not set one, and a password
-- is never sent by email. The columns hold the SHA-256 of a one-time link, in
-- the same shape as LicenseToken.tokenHash, so a database leak cannot be
-- redeemed. All three are nullable: most rows have no link outstanding.
--
-- No backfill is needed. Existing accounts keep signing in with the password
-- they already have; "no outstanding link" is exactly the null state.

ALTER TABLE "tenant_users" ADD COLUMN "invite_token_hash" TEXT;
ALTER TABLE "tenant_users" ADD COLUMN "invite_expires_at" TIMESTAMP(3);
ALTER TABLE "tenant_users" ADD COLUMN "invite_sent_at" TIMESTAMP(3);

-- Unique so a link resolves to at most one account. Postgres allows any number
-- of NULLs in a unique index, which is what "no link outstanding" looks like.
CREATE UNIQUE INDEX "tenant_users_invite_token_hash_key" ON "tenant_users"("invite_token_hash");
