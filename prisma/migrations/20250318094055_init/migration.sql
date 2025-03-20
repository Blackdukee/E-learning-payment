/*
  Warnings:

  - You are about to drop the column `payoutId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the `Payout` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_payoutId_fkey";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "payoutId";

-- DropTable
DROP TABLE "Payout";

-- DropEnum
DROP TYPE "PayoutStatus";

-- CreateTable
CREATE TABLE "ConfigSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "transaction_userId_index" ON "Transaction"("userId");
