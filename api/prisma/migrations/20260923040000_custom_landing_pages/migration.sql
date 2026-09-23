-- Client-authored custom landing pages: the simulated login a target lands on
-- after clicking. bodyHtml is stored already sanitized (appearance only — no
-- scripts, no credential-capturing form; the platform injects its metadata-only
-- form at render). A campaign may point at one instead of a built-in template.
CREATE TABLE "custom_landing_pages" (
  "id"         UUID PRIMARY KEY,
  "tenant_id"  UUID NOT NULL,
  "name"       TEXT NOT NULL,
  "body_html"  TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "custom_landing_pages_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "custom_landing_pages_tenant_id_idx" ON "custom_landing_pages"("tenant_id");

ALTER TABLE "campaigns" ADD COLUMN "landing_page_id" UUID;
ALTER TABLE "campaigns"
  ADD CONSTRAINT "campaigns_landing_page_id_fkey"
  FOREIGN KEY ("landing_page_id") REFERENCES "custom_landing_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
