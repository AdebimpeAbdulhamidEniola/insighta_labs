/*
  Warnings:

  - Added the required column `country_name` to the `Profile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "country_name" TEXT NOT NULL;
