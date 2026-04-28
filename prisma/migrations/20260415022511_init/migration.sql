-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "gender_probability" DOUBLE PRECISION NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "age" INTEGER NOT NULL,
    "age_group" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "country_probability" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_name_key" ON "Profile"("name");
