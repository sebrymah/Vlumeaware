-- Employee self-service portal auth. Employees have no password; they reach
-- their own dashboard (courses, certificates, simulation history) via a
-- time-limited magic link. The opaque token and its expiry live on the
-- employee row.
ALTER TABLE "employees" ADD COLUMN "portal_token" TEXT;
ALTER TABLE "employees" ADD COLUMN "portal_token_expires_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "employees_portal_token_key" ON "employees"("portal_token");
