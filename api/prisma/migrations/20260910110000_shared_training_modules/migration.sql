-- AlterTable
ALTER TABLE "training_modules" ADD COLUMN     "shared_module_id" UUID;

-- CreateTable
CREATE TABLE "shared_training_modules" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "video_url" TEXT NOT NULL,
    "video_source" "VideoSource" NOT NULL,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_training_modules_pkey" PRIMARY KEY ("id")
);

