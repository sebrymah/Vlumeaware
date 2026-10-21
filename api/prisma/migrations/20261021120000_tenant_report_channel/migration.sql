-- CreateEnum
CREATE TYPE "ReportMethod" AS ENUM ('forwarding', 'connected');

-- CreateEnum
CREATE TYPE "ReportProvider" AS ENUM ('zoho', 'google', 'microsoft');

-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('unconfigured', 'active', 'error');

-- CreateTable
CREATE TABLE "tenant_report_channels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "method" "ReportMethod" NOT NULL DEFAULT 'forwarding',
    "provider" "ReportProvider",
    "forwarding_token" TEXT NOT NULL,
    "status" "ChannelStatus" NOT NULL DEFAULT 'active',
    "last_received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_report_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_report_channels_tenant_id_key" ON "tenant_report_channels"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_report_channels_forwarding_token_key" ON "tenant_report_channels"("forwarding_token");

-- AddForeignKey
ALTER TABLE "tenant_report_channels" ADD CONSTRAINT "tenant_report_channels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
