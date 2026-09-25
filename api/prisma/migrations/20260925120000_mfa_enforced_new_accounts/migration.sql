-- Enforce MFA for accounts created from here on, without locking out anyone who
-- already exists.
--
-- Staff (`users`): the column defaults to true, so every staff account created
-- after this migration must enrol before it can use the API — enforced by
-- MfaEnforcedGuard, not by the console. The UPDATE that follows grandfathers
-- the accounts that already exist: it runs immediately after the column is
-- added, in the same transaction, so there is no window in which an existing
-- user is locked out.
--
-- Client users (`tenant_users`): MFA is an opt-in per-tenant policy
-- (tenants.require_mfa), so the column defaults to false and user creation
-- copies the tenant's policy into it. No backfill is needed or wanted here.
--
-- On a fresh database the UPDATE matches nothing, which is correct — there is
-- nobody to grandfather. The seeder sets the flag explicitly to false for the
-- documented demo staff accounts, which are development credentials by design.

-- AlterTable
ALTER TABLE "tenant_users" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT true;

-- Grandfather every staff account that already exists.
UPDATE "users" SET "mfa_required" = false;
