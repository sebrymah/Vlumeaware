-- Security policy a client admin sets for their own console users. Additive
-- and defaulted, so existing tenants keep their current behaviour: a 12
-- character minimum, an 8 hour session, and MFA optional.
ALTER TABLE "tenants" ADD COLUMN "password_min_length" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "tenants" ADD COLUMN "session_timeout_minutes" INTEGER NOT NULL DEFAULT 480;
ALTER TABLE "tenants" ADD COLUMN "require_mfa" BOOLEAN NOT NULL DEFAULT false;

-- MFA and lockout for client users, mirroring what Vlumetech staff already
-- have. Client logins previously had no brute-force protection at all.
ALTER TABLE "tenant_users" ADD COLUMN "mfa_secret" TEXT;
ALTER TABLE "tenant_users" ADD COLUMN "mfa_enabled_at" TIMESTAMP(3);
ALTER TABLE "tenant_users" ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenant_users" ADD COLUMN "locked_until" TIMESTAMP(3);
