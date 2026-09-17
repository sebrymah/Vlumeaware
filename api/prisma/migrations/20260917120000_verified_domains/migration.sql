-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('pending', 'verified');

-- CreateTable
CREATE TABLE "verified_domains" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verified_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verified_domains_tenant_id_idx" ON "verified_domains"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "verified_domains_tenant_id_domain_key" ON "verified_domains"("tenant_id", "domain");

-- AddForeignKey
ALTER TABLE "verified_domains" ADD CONSTRAINT "verified_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
