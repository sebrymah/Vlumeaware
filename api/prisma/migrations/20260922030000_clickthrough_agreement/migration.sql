-- Onboarding required Vlumetech to upload a countersigned PDF before a client
-- could do anything, which blocked self-serve trials on a manual step. A
-- client can now accept the terms online at signup instead.
--
-- ndpa_agreement_signed_at stays the single field the consent gate reads, so
-- both routes open the same gate and no guard has to learn about the new one.
-- These columns only record provenance, which is what makes a click-through
-- defensible: the version accepted, by whom, from where.
ALTER TABLE "tenants" ADD COLUMN "agreement_method" TEXT;
ALTER TABLE "tenants" ADD COLUMN "agreement_version" TEXT;
ALTER TABLE "tenants" ADD COLUMN "agreement_accepted_by" TEXT;
ALTER TABLE "tenants" ADD COLUMN "agreement_accepted_ip" TEXT;

-- Existing tenants got here by the document route, by definition.
UPDATE "tenants" SET "agreement_method" = 'signed_document'
WHERE "ndpa_agreement_signed_at" IS NOT NULL;
