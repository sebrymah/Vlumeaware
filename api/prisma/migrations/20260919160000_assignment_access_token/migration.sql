-- Standalone training-invite access token for the public /learn page.
ALTER TABLE "training_assignments" ADD COLUMN "access_token" TEXT;
CREATE UNIQUE INDEX "training_assignments_access_token_key" ON "training_assignments"("access_token");
