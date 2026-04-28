-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "github_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar_url" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'analyst',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_github_id_key" ON "User"("github_id");
