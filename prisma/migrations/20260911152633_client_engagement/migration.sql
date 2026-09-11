-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('NOT_BILLED', 'INVOICED', 'PAID', 'OVERDUE');

-- CreateTable
CREATE TABLE "ClientEngagement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "engagementStatus" "EngagementStatus" NOT NULL DEFAULT 'ONBOARDING',
    "accountingFee" DECIMAL(18,2),
    "billingStatus" "BillingStatus" NOT NULL DEFAULT 'NOT_BILLED',
    "invoiceNumber" TEXT,
    "amountDue" DECIMAL(18,2),
    "dueDate" TIMESTAMP(3),
    "lastPaymentDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientEngagement_companyId_key" ON "ClientEngagement"("companyId");

-- AddForeignKey
ALTER TABLE "ClientEngagement" ADD CONSTRAINT "ClientEngagement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
