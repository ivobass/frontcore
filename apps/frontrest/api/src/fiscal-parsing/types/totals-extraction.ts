/**
 * Total da fatura. Só `totalAmount` — é o único campo de totais que
 * existe hoje em `Invoice`/`InvoiceDraft` (`packages/database/prisma/schema.prisma`);
 * campos adicionais (subtotal, descontos) só quando um consumidor real
 * precisar deles.
 */
export interface TotalsExtraction {
  totalAmount: number;
}
