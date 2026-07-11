-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "InvoiceDraft" ADD COLUMN     "ocrError" TEXT,
ADD COLUMN     "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'PENDING';
