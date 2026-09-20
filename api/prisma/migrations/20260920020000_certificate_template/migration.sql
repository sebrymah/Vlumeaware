-- Which layout a client's completion certificates use. Additive and defaulted,
-- so existing tenants keep rendering without a backfill.
ALTER TABLE "tenants" ADD COLUMN "certificate_template" TEXT NOT NULL DEFAULT 'branded';
