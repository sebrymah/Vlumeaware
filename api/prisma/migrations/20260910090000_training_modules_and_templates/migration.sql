-- CreateEnum
CREATE TYPE "VideoSource" AS ENUM ('upload', 'link');

-- DropIndex
DROP INDEX "training_assignments_employee_id_curriculum_module_id_sourc_key";

-- AlterTable
ALTER TABLE "training_assignments" ADD COLUMN     "training_module_id" UUID;

-- AlterTable
ALTER TABLE "training_routing_rules" DROP COLUMN "curriculum_module_id",
ADD COLUMN     "training_module_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "training_modules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "video_url" TEXT NOT NULL,
    "video_source" "VideoSource" NOT NULL,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phishing_templates" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "difficulty_tier" "DifficultyTier" NOT NULL,
    "industry_tag" TEXT,
    "subject_line" TEXT NOT NULL,
    "body_html" TEXT NOT NULL,
    "sender_spoof_name" TEXT NOT NULL,
    "red_flags" TEXT[],
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phishing_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "training_modules_tenant_id_idx" ON "training_modules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "training_assignments_employee_id_training_module_id_source__key" ON "training_assignments"("employee_id", "training_module_id", "source_send_id");

-- AddForeignKey
ALTER TABLE "training_routing_rules" ADD CONSTRAINT "training_routing_rules_training_module_id_fkey" FOREIGN KEY ("training_module_id") REFERENCES "training_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_training_module_id_fkey" FOREIGN KEY ("training_module_id") REFERENCES "training_modules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_modules" ADD CONSTRAINT "training_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

