-- Staff account lifecycle and a stated platform security policy.
--
-- Vlumetech accounts were seed-only: no way to add a colleague, withdraw access
-- when someone leaves, or recover an account whose authenticator was lost. ISO 27001
-- A.9.2 is precisely the expectation that user access is registered, reviewed and
-- removed.
--
-- The invitation columns mirror tenant_users: a new account starts with an
-- unknowable hash and only the emailed link can set a password. No administrator
-- ever types another staff member's password.

ALTER TABLE "users" ADD COLUMN "invite_token_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "invite_expires_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "invite_sent_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "password_set_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_invite_token_hash_key" ON "users"("invite_token_hash");

-- Existing staff are active, have a password, and are covered by the MFA policy.
-- No backfill of last_login_at: we do not know it, and inventing a date would be
-- worse than an empty column an auditor can see.
UPDATE "users" SET "password_set_at" = "created_at" WHERE "password_hash" IS NOT NULL;

CREATE TABLE "platform_security_policy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "require_mfa" BOOLEAN NOT NULL DEFAULT true,
    "password_min_length" INTEGER NOT NULL DEFAULT 12,
    "session_timeout_minutes" INTEGER NOT NULL DEFAULT 480,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    CONSTRAINT "platform_security_policy_pkey" PRIMARY KEY ("id")
);

INSERT INTO "platform_security_policy" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP);
