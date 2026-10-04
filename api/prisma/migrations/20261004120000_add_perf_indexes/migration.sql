-- B1: performance indexes for risk scoring, report metrics, and the scheduler.
--
-- Postgres does not auto-index foreign keys. Risk scoring, the learner portal
-- and training lookups all filter `sends` by employee_id, and the scheduler
-- filters `campaigns` by (status, scheduled_send_at) on every tick — none of
-- which was indexed.
--
-- The single (campaign_id) index is replaced by (campaign_id, sent_at): the
-- composite serves campaign_id-only lookups too, and additionally covers the
-- report-metrics queries that count a campaign's sends by sent_at.
--
-- NOTE: these are plain CREATE INDEX (brief lock). Tables are small today; when
-- `sends` grows large, apply the equivalent CREATE INDEX CONCURRENTLY outside a
-- transaction instead, to avoid blocking writes during the build.

DROP INDEX IF EXISTS "sends_campaign_id_idx";
CREATE INDEX "sends_campaign_id_sent_at_idx" ON "sends"("campaign_id", "sent_at");

CREATE INDEX "sends_employee_id_idx" ON "sends"("employee_id");

CREATE INDEX "campaigns_status_scheduled_send_at_idx" ON "campaigns"("status", "scheduled_send_at");
