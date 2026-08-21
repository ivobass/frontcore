import type { AiStructuredOutputDefinition } from '@frontcore/ai';

/**
 * JSON Schema (subconjunto "strict" OpenAI-compatible — todo o objeto
 * com `additionalProperties: false`, toda a propriedade sempre listada
 * em `required`, ausência representada por `type: [tipo, "null"]`,
 * nunca omitindo a chave) espelhando `AiInvoiceExtractionV1`
 * exatamente. Passado como `AiCompletionRequest.responseFormat` —
 * `OpenRouterAiProvider` (`packages/ai`) traduz para
 * `response_format.json_schema`. A validação estrutural real acontece
 * sempre em `parseAiInvoiceExtraction()` (`ai-invoice-extraction.parser.ts`)
 * — este schema reduz a frequência de respostas mal formadas, nunca
 * substitui essa validação (o "strict" de um provider concreto nunca é
 * a fronteira de confiança).
 */
const NULLABLE_STRING = { type: ['string', 'null'] } as const;

const LINE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    position: { type: 'integer' },
    description: { type: 'string' },
    quantity: NULLABLE_STRING,
    unit: NULLABLE_STRING,
    unitPrice: NULLABLE_STRING,
    vatRate: NULLABLE_STRING,
    totalPrice: NULLABLE_STRING,
  },
  required: ['position', 'description', 'quantity', 'unit', 'unitPrice', 'vatRate', 'totalPrice'],
};

const AI_INVOICE_EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'string', enum: ['1'] },
    supplier: {
      type: 'object',
      additionalProperties: false,
      properties: { name: NULLABLE_STRING, taxId: NULLABLE_STRING },
      required: ['name', 'taxId'],
    },
    invoice: {
      type: 'object',
      additionalProperties: false,
      properties: {
        number: NULLABLE_STRING,
        issueDate: NULLABLE_STRING,
        dueDate: NULLABLE_STRING,
        currency: NULLABLE_STRING,
      },
      required: ['number', 'issueDate', 'dueDate', 'currency'],
    },
    totals: {
      type: 'object',
      additionalProperties: false,
      properties: { subtotal: NULLABLE_STRING, vatAmount: NULLABLE_STRING, total: NULLABLE_STRING },
      required: ['subtotal', 'vatAmount', 'total'],
    },
    items: { type: 'array', items: LINE_SCHEMA },
  },
  required: ['schemaVersion', 'supplier', 'invoice', 'totals', 'items'],
};

export const AI_INVOICE_EXTRACTION_RESPONSE_FORMAT: AiStructuredOutputDefinition = {
  name: 'ai_invoice_extraction_v1',
  schema: AI_INVOICE_EXTRACTION_JSON_SCHEMA,
  strict: true,
};
