-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "self_signup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

