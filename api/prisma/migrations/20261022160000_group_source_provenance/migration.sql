-- Provenance for groups created from campaign results.
--
-- A group assembled by "everyone who clicked the October campaign" should be able
-- to say so later. Two nullable columns; no foreign key, because the source
-- campaign may be deleted while the group (and the training targeted at it) lives
-- on. Existing groups are hand-built and remain null.

ALTER TABLE "employee_groups" ADD COLUMN "source_campaign_id" UUID;
ALTER TABLE "employee_groups" ADD COLUMN "source_criteria" TEXT;
