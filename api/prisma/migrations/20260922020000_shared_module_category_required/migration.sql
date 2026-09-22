-- Category was optional and nothing set it, so every row in the shared library
-- rendered "—" in the client's Category column and the library could not be
-- browsed by topic. Backfill first, then enforce, so the constraint cannot be
-- added against existing NULLs.
UPDATE "shared_training_modules" SET "category" = 'General' WHERE "category" IS NULL;
ALTER TABLE "shared_training_modules" ALTER COLUMN "category" SET NOT NULL;
