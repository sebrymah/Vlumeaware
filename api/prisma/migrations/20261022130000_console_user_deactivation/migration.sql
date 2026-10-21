-- Withdrawing console access without destroying the record.
--
-- A client admin offboarding a colleague should not have to choose between
-- "still has access" and "the row is gone": the audit trail refers to these
-- users, and an accidental removal should be reversible. Null means active.
--
-- No backfill: every existing account is active.

ALTER TABLE "tenant_users" ADD COLUMN "deactivated_at" TIMESTAMP(3);
