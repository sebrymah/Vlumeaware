-- Per-campaign sender display name ("title"). The From shows this instead of
-- the scenario's sender name, so a client can make simulated mail read as e.g.
-- "IT Service Desk" rather than exposing the raw simulation address. Blank
-- falls back to each scenario's own sender name.
ALTER TABLE "campaigns" ADD COLUMN "sender_name" TEXT;
