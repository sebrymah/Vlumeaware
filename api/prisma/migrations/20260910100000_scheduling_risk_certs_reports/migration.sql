-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "launched_at" TIMESTAMP(3),
ADD COLUMN     "parent_campaign_id" UUID,
ADD COLUMN     "recurrence_days" INTEGER,
ADD COLUMN     "send_window_minutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "quizzes" ADD COLUMN     "allow_retakes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "max_attempts" INTEGER;

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "module_title" TEXT NOT NULL,
    "quiz_title" TEXT,
    "score_pct" INTEGER NOT NULL,
    "source_send_id" UUID,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phish_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID,
    "reporter_email" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT,
    "matched_simulation" BOOLEAN NOT NULL DEFAULT false,
    "matched_send_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phish_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificates_serial_key" ON "certificates"("serial");

-- CreateIndex
CREATE INDEX "certificates_tenant_id_idx" ON "certificates"("tenant_id");

-- CreateIndex
CREATE INDEX "certificates_employee_id_idx" ON "certificates"("employee_id");

-- CreateIndex
CREATE INDEX "phish_reports_tenant_id_idx" ON "phish_reports"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_parent_campaign_id_fkey" FOREIGN KEY ("parent_campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phish_reports" ADD CONSTRAINT "phish_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phish_reports" ADD CONSTRAINT "phish_reports_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

