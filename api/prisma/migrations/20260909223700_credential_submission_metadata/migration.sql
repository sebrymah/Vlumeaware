-- CreateTable
CREATE TABLE "credential_submissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "send_id" UUID NOT NULL,
    "username_length" INTEGER,
    "password_length" INTEGER,
    "username_looks_like_email" BOOLEAN,
    "time_to_submit_ms" INTEGER,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_submissions_tenant_id_idx" ON "credential_submissions"("tenant_id");

-- CreateIndex
CREATE INDEX "credential_submissions_send_id_idx" ON "credential_submissions"("send_id");

-- AddForeignKey
ALTER TABLE "credential_submissions" ADD CONSTRAINT "credential_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_submissions" ADD CONSTRAINT "credential_submissions_send_id_fkey" FOREIGN KEY ("send_id") REFERENCES "sends"("id") ON DELETE CASCADE ON UPDATE CASCADE;
