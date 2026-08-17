-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "perks" TEXT[] DEFAULT ARRAY[]::TEXT[];
