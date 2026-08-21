-- AlterTable
ALTER TABLE "InvoiceDraft" ADD COLUMN     "itemsReviewedByHuman" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
-- Correção pós-revisão Codex: a precisão original propunha
-- Decimal(10,2)->Decimal(10,3) e Decimal(12,2)->Decimal(12,4) — isto
-- REDUZIA a capacidade da parte inteira (10,2 tinha 8 dígitos inteiros;
-- 10,3 só 7. 12,2 tinha 10 dígitos inteiros; 12,4 só 8), podendo tornar
-- valores existentes inválidos. Corrigido para preservar a magnitude
-- máxima anterior E acrescentar as casas decimais novas:
--   quantity:  Decimal(10,2) [8 inteiros] -> Decimal(11,3) [8 inteiros + 3 decimais]
--   unitPrice: Decimal(12,2) [10 inteiros] -> Decimal(14,4) [10 inteiros + 4 decimais]
ALTER TABLE "InvoiceItem" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "vatRate" DECIMAL(5,2),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(11,3),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,4);

-- CreateTable
-- Mesma precisão final de InvoiceItem (correção pós-revisão Codex) —
-- consistência entre staging e final, não uma questão de migração (tabela nova).
CREATE TABLE "InvoiceDraftItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceDraftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(11,3),
    "unit" TEXT,
    "unitPrice" DECIMAL(14,4),
    "vatRate" DECIMAL(5,2),
    "totalPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDraftItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDraftAiExtraction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceDraftId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDraftAiExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDraftItem_organizationId_idx" ON "InvoiceDraftItem"("organizationId");

-- CreateIndex
CREATE INDEX "InvoiceDraftItem_invoiceDraftId_idx" ON "InvoiceDraftItem"("invoiceDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraftItem_invoiceDraftId_position_key" ON "InvoiceDraftItem"("invoiceDraftId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraftAiExtraction_invoiceDraftId_key" ON "InvoiceDraftAiExtraction"("invoiceDraftId");

-- CreateIndex
CREATE INDEX "InvoiceDraftAiExtraction_organizationId_idx" ON "InvoiceDraftAiExtraction"("organizationId");

-- AddForeignKey
ALTER TABLE "InvoiceDraftItem" ADD CONSTRAINT "InvoiceDraftItem_invoiceDraftId_fkey" FOREIGN KEY ("invoiceDraftId") REFERENCES "InvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftAiExtraction" ADD CONSTRAINT "InvoiceDraftAiExtraction_invoiceDraftId_fkey" FOREIGN KEY ("invoiceDraftId") REFERENCES "InvoiceDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

