-- CreateTable
CREATE TABLE "InvoiceDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "storageObjectId" TEXT NOT NULL,
    "supplierId" TEXT,
    "categoryId" TEXT,
    "number" TEXT,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(12,2),
    "notes" TEXT,
    "ocrText" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraft_storageObjectId_key" ON "InvoiceDraft"("storageObjectId");

-- CreateIndex
CREATE INDEX "InvoiceDraft_organizationId_idx" ON "InvoiceDraft"("organizationId");

-- CreateIndex
CREATE INDEX "InvoiceDraft_supplierId_idx" ON "InvoiceDraft"("supplierId");

-- CreateIndex
CREATE INDEX "InvoiceDraft_categoryId_idx" ON "InvoiceDraft"("categoryId");

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_storageObjectId_fkey" FOREIGN KEY ("storageObjectId") REFERENCES "StorageObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
