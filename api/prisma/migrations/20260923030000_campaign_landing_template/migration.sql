-- Per-campaign landing-page template. The simulated login page can wear a
-- recognisable provider look (Microsoft 365, Google, Okta) or the tenant's own
-- brand ("generic"), so the page staff land on matches the portal they really
-- sign in to. Appearance only — the page still captures metadata, never
-- credentials.
ALTER TABLE "campaigns" ADD COLUMN "landing_template" TEXT NOT NULL DEFAULT 'generic';
