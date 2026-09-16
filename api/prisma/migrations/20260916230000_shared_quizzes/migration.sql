-- CreateTable
CREATE TABLE "shared_quizzes" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "passing_score_pct" INTEGER NOT NULL DEFAULT 80,
    "source" TEXT,
    "questions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_quizzes_pkey" PRIMARY KEY ("id")
);
