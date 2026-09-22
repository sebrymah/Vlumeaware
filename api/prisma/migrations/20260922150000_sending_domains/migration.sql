-- Sending domains: domains a client may send simulated phishing AS, verified
-- with the email provider so the mail passes authentication. Distinct from
-- verified_domains, which govern who they may send TO. The From address of a
-- campaign was a single global SIMULATION_FROM_ADDRESS for every client; it is
-- now a verified sending domain chosen per campaign.
CREATE TYPE "SendingDomainStatus" AS ENUM ('pending', 'verified', 'failed');

CREATE TABLE "sending_domains" (
  "id"          UUID PRIMARY KEY,
  "tenant_id"   UUID NOT NULL,
  "domain"      TEXT NOT NULL,
  "provider_id" TEXT,
  "status"      "SendingDomainStatus" NOT NULL DEFAULT 'pending',
  "dns_records" JSONB,
  "verified_at" TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sending_domains_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sending_domains_tenant_id_domain_key" ON "sending_domains"("tenant_id", "domain");
CREATE INDEX "sending_domains_tenant_id_idx" ON "sending_domains"("tenant_id");

-- Campaign chooses one verified sending domain, and the From local part.
ALTER TABLE "campaigns" ADD COLUMN "sending_domain_id" UUID;
ALTER TABLE "campaigns" ADD COLUMN "from_local_part" TEXT;
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_sending_domain_id_fkey"
  FOREIGN KEY ("sending_domain_id") REFERENCES "sending_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
