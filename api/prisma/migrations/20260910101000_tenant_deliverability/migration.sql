-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "allowlist_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "digest_email" TEXT,
ADD COLUMN     "digest_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sending_domain" TEXT;

