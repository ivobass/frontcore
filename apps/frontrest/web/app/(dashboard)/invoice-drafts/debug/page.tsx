'use client';

import { useEffect, useState } from 'react';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  FieldLabel,
  Spinner,
  Alert,
  AlertDescription,
} from '@frontcore/ui';
import { useSession } from '../../../../lib/session-context';
import { getInvoiceDraft } from '../../../../lib/invoice-drafts';
import type { InvoiceDraft, FiscalExtractionResult } from '../../../../lib/invoice-drafts';
import { getFiscalExtractionDebug } from '../../../../lib/invoice-drafts';
import { getUpload } from '../../../../lib/uploads';
import type { StorageObjectWithDownloadUrl } from '../../../../lib/uploads';
import { OCR_STATUS_BADGE_VARIANT, OCR_STATUS_LABELS } from '../constants';

/**
 * Ferramenta de diagnóstico do pipeline OCR + Parsing Fiscal (Fase
 * 6.8+) — achado real (validação manual): o browser só mostra o
 * resultado final ("Fornecedor sugerido: X"), nunca em que etapa do
 * pipeline (rasterização → OCR → cada extractor) um valor errado
 * nasceu. Sem endpoint novo: reutiliza inteiramente dados já servidos
 * por `GET /invoices/drafts/:id` (inclui `ocrText`/`ocrConfidence`),
 * `GET /invoices/drafts/:id/fiscal-parsing` (já devolve o
 * `FiscalExtractionResult` completo, campo a campo, com confiança e
 * excerto de origem) e `GET /uploads/:id` (URL assinada do documento
 * original). Duas colunas lado a lado (`draftIdA`/`draftIdB`) para
 * comparar dois uploads da mesma fatura.
 */
export default function InvoiceDraftDebugPage() {
  const { session } = useSession();

  const [draftIdAInput, setDraftIdAInput] = useState('');
  const [draftIdBInput, setDraftIdBInput] = useState('');
  const [draftIdA, setDraftIdA] = useState<string | null>(null);
  const [draftIdB, setDraftIdB] = useState<string | null>(null);

  // Pré-preenche a coluna A a partir de `?id=` — sem `useSearchParams()`
  // (exigiria um limite `Suspense` só para isto); lido uma vez, no
  // arranque, diretamente do browser.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      setDraftIdAInput(id);
      setDraftIdA(id);
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diagnóstico do pipeline OCR"
        description="Documento → texto OCR bruto → cada campo extraído → payload enviado à UI. Preencha um ou dois IDs de rascunho para inspecionar ou comparar."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <FieldLabel>ID do rascunho A</FieldLabel>
          <div className="flex gap-2">
            <Input
              value={draftIdAInput}
              onChange={(event) => setDraftIdAInput(event.target.value)}
              placeholder="ex. cmrkl7jyd000nqc4atwofsaiv"
              className="w-72"
            />
            <Button variant="outline" onClick={() => setDraftIdA(draftIdAInput.trim() || null)}>
              Carregar
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <FieldLabel>ID do rascunho B (opcional, para comparar)</FieldLabel>
          <div className="flex gap-2">
            <Input
              value={draftIdBInput}
              onChange={(event) => setDraftIdBInput(event.target.value)}
              placeholder="ex. cmrkkwhh6000bqc4ahj91amlf"
              className="w-72"
            />
            <Button variant="outline" onClick={() => setDraftIdB(draftIdBInput.trim() || null)}>
              Carregar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {draftIdA ? <PipelinePanel key={draftIdA} accessToken={session.accessToken} draftId={draftIdA} /> : null}
        {draftIdB ? <PipelinePanel key={draftIdB} accessToken={session.accessToken} draftId={draftIdB} /> : null}
      </div>
    </div>
  );
}

interface PipelinePanelProps {
  accessToken: string;
  draftId: string;
}

function PipelinePanel({ accessToken, draftId }: PipelinePanelProps) {
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [upload, setUpload] = useState<StorageObjectWithDownloadUrl | null>(null);
  const [fiscal, setFiscal] = useState<FiscalExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraft(null);
    setUpload(null);
    setFiscal(null);

    getInvoiceDraft(accessToken, draftId)
      .then(async (loadedDraft) => {
        if (cancelled) return;
        setDraft(loadedDraft);

        const uploadPromise = getUpload(accessToken, loadedDraft.storageObject.id).catch(() => null);
        const fiscalPromise =
          loadedDraft.ocrStatus === 'COMPLETED'
            ? getFiscalExtractionDebug(accessToken, draftId).catch(() => null)
            : Promise.resolve(null);

        const [loadedUpload, loadedFiscal] = await Promise.all([uploadPromise, fiscalPromise]);
        if (cancelled) return;
        setUpload(loadedUpload);
        setFiscal(loadedFiscal);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Erro ao carregar rascunho.');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, draftId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    );
  }

  if (error || !draft) {
    return (
      <Card>
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertDescription>{error ?? 'Rascunho não encontrado.'}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const isImage = draft.storageObject.contentType.startsWith('image/');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{draft.storageObject.filename}</CardTitle>
        <CardDescription>ID: {draft.id}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <PipelineStage number={1} title="Documento">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <DebugField label="Ficheiro" value={draft.storageObject.filename} />
            <DebugField label="Tipo" value={draft.storageObject.contentType} />
            <DebugField label="Tamanho" value={`${Math.round(draft.storageObject.size / 1024)} KB`} />
            <DebugField label="Carregado em" value={new Date(draft.storageObject.createdAt).toLocaleString('pt-PT')} />
          </dl>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={OCR_STATUS_BADGE_VARIANT[draft.ocrStatus]}>
              {OCR_STATUS_LABELS[draft.ocrStatus]}
            </Badge>
            {upload ? (
              <a
                href={upload.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary underline underline-offset-2"
              >
                Abrir documento original
              </a>
            ) : null}
          </div>
        </PipelineStage>

        <PipelineStage number={2} title="Imagem rasterizada">
          {isImage ? (
            upload ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={upload.downloadUrl}
                alt={`Pré-visualização de ${draft.storageObject.filename}`}
                className="max-h-64 rounded border border-border object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Pré-visualização indisponível.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Limitação conhecida: para documentos PDF, a imagem rasterizada por página (a que
              realmente chega ao OCR) não é persistida nesta fase — só o PDF original, acima, e o
              texto OCR resultante, abaixo, estão disponíveis para inspeção.
            </p>
          )}
        </PipelineStage>

        <PipelineStage number={3} title="Texto OCR bruto">
          {draft.ocrText ? (
            <>
              <p className="mb-2 text-sm text-muted-foreground">
                Confiança OCR: {draft.ocrConfidence !== null ? `${Math.round(draft.ocrConfidence)}%` : '—'}
              </p>
              <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                {draft.ocrText}
              </pre>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {draft.ocrError ?? 'Ainda sem texto OCR disponível.'}
            </p>
          )}
        </PipelineStage>

        <PipelineStage number={4} title="Fornecedor extraído">
          <ExtractedField match={fiscal?.supplier ?? null} render={(v) => v.name} info={EXTRACTOR_INFO.supplier} />
        </PipelineStage>

        <PipelineStage number={5} title="NIF extraído">
          <ExtractedField match={fiscal?.supplierTaxId ?? null} render={(v) => v} info={EXTRACTOR_INFO.taxId} />
        </PipelineStage>

        <PipelineStage number={6} title="Número extraído">
          <ExtractedField
            match={fiscal?.invoice.number ?? null}
            render={(v) => v}
            info={EXTRACTOR_INFO.invoiceNumber}
            rejection={findRejection(fiscal, 'invoiceNumber')}
          />
        </PipelineStage>

        <PipelineStage number={7} title="Data extraída">
          <p className="text-xs font-medium text-muted-foreground">Emissão</p>
          <ExtractedField
            match={fiscal?.invoice.issueDate ?? null}
            render={(v) => new Date(v).toLocaleDateString('pt-PT')}
            info={EXTRACTOR_INFO.issueDate}
          />
          <p className="mt-2 text-xs font-medium text-muted-foreground">Vencimento</p>
          <ExtractedField
            match={fiscal?.invoice.dueDate ?? null}
            render={(v) => new Date(v).toLocaleDateString('pt-PT')}
            info={EXTRACTOR_INFO.dueDate}
          />
        </PipelineStage>

        <PipelineStage number={8} title="Total extraído">
          <ExtractedField
            match={fiscal?.totals ?? null}
            render={(v) => `${v.totalAmount} €`}
            info={EXTRACTOR_INFO.totals}
            rejection={findRejection(fiscal, 'totals')}
          />
        </PipelineStage>

        <PipelineStage number={9} title="IVA extraído">
          <ExtractedField
            match={fiscal?.vat ?? null}
            render={(v) => [v.rate !== undefined ? `${v.rate}%` : null, v.amount !== undefined ? `${v.amount} €` : null].filter(Boolean).join(' / ')}
            info={EXTRACTOR_INFO.vat}
          />
        </PipelineStage>

        <PipelineStage number={10} title="Payload enviado para a UI">
          {fiscal ? (
            <pre className="max-h-64 overflow-auto rounded border border-border bg-muted/30 p-3 text-xs">
              {JSON.stringify(fiscal, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem sugestões fiscais — OCR ainda não concluído ou sem texto extraído.
            </p>
          )}
        </PipelineStage>
      </CardContent>
    </Card>
  );
}

function PipelineStage({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <p className="mb-2 text-sm font-semibold">
        {number}. {title}
      </p>
      {children}
    </div>
  );
}

function DebugField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

interface ExtractorInfo {
  /** Nome da classe responsável (`apps/frontrest/api/src/fiscal-parsing/extractors/`). */
  extractor: string;
  /** Regra de match e o motivo mais comum de "não encontrado" — texto estático, não derivado em runtime. */
  rule: string;
}

/**
 * Descrição estática de cada extractor — a regra real aplicada
 * (extraída dos comentários do próprio extractor), mostrada sempre ao
 * lado do resultado. Complementa `findRejection()` (Fase 6.8+, "false
 * positive hardening"): quando existir um candidato rejeitado
 * dinâmico para o campo, este texto explica a regra geral; o
 * `rejection` explica o caso concreto deste documento.
 */
const EXTRACTOR_INFO: Record<string, ExtractorInfo> = {
  supplier: {
    extractor: 'SupplierExtractor',
    rule: 'Rótulo "Fornecedor:"/"Emitente:"/"Supplier:"/"Vendor:"/"Issued by:" (nome ≥3 carateres); sem rótulo, usa a 1ª linha não vazia do texto (confiança baixa, 40).',
  },
  taxId: {
    extractor: 'TaxNumberExtractor',
    rule: 'Rótulo "NIF"/"NTF"/"NIPC"/"VAT"/"Tax ID" seguido de 9-12 dígitos — tolera O/I/l/B/S/Z confundidos com dígitos, normalizados e revalidados como puramente numéricos.',
  },
  invoiceNumber: {
    extractor: 'InvoiceNumberExtractor',
    rule: 'Rótulo "Fatura"/"Factura"/"Invoice" + "N.º"/"No"/"#" seguido do código da série — nunca captura "ATCUD"; prefixo de série com espaço aceite só com 2-4 carateres (nunca 1, para não capturar ruído de OCR solto).',
  },
  issueDate: {
    extractor: 'InvoiceDateExtractor',
    rule: 'Rótulo "Data (de Emissão)"/"Invoice Date"/"Date of Issue"/"Issued on" + data DD/MM/AAAA ou AAAA-MM-DD; rejeita anos implausíveis e datas futuras (nunca aceita, ex., ano 2096).',
  },
  dueDate: {
    extractor: 'DueDateExtractor',
    rule: 'Rótulo "Data de Vencimento"/"Vencimento"/"Due Date"/"Payment Due" + data; rejeita anos implausíveis, mas aceita datas futuras (vencimento a prazo é o caso normal).',
  },
  totals: {
    extractor: 'TotalsExtractor',
    rule: 'Rótulo específico ("Total a Pagar"/"Valor Total"/...) tem prioridade sobre "Total" genérico; entre vários, fica com o último (após subtotal/IVA); tolera "T" de "Total" confundido com l/I/1/r.',
  },
  vat: {
    extractor: 'VatExtractor',
    rule: 'Tabela "Taxa/Valor/Valor IVA/Líquido" tem prioridade (2ª coluna = IVA, não a 1ª); sem tabela, cai para "IVA (23%): 12,34€" ou variantes só-taxa/só-montante.',
  },
};

/** Procura, em `metadata.rejectedCandidates`, a explicação de rejeição para `field` — `undefined` quando não há nenhuma (nunca um valor inventado). */
function findRejection(fiscal: FiscalExtractionResult | null | undefined, field: string) {
  return fiscal?.metadata.rejectedCandidates.find((r) => r.field === field);
}

/**
 * Renderiza um `ExtractionMatch` — valor, confiança e excerto de
 * origem — ou "não encontrado", com a regra do extractor sempre
 * disponível. Quando existir uma rejeição dinâmica para este campo
 * (Fase 6.8+), mostra o candidato concreto e o motivo — nunca ao mesmo
 * tempo que um valor aceite, já que `rejectedCandidates` só é populado
 * para campos que ficaram `null`.
 */
function ExtractedField<T>({
  match,
  render,
  info,
  rejection,
}: {
  match: { value: T; confidence: number; source?: string } | null;
  render: (value: T) => string;
  info: ExtractorInfo;
  rejection?: { candidate: string; reason: string };
}) {
  return (
    <div className="text-sm">
      {match ? (
        <>
          <p>
            <span className="font-medium">{render(match.value)}</span>{' '}
            <span className="text-muted-foreground">— {Math.round(match.confidence)}% confiança</span>
          </p>
          {match.source ? (
            <p className="mt-1 text-xs text-muted-foreground">Origem: &quot;{match.source}&quot;</p>
          ) : null}
        </>
      ) : rejection ? (
        <Alert variant="warning" className="mt-1">
          <AlertDescription>
            <p className="font-medium">Candidato rejeitado</p>
            <p>
              Candidato: <span className="font-mono">&quot;{rejection.candidate}&quot;</span>
            </p>
            <p>Motivo: {rejection.reason}</p>
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-muted-foreground">Não encontrado.</p>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {info.extractor} — ver regra
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">{info.rule}</p>
      </details>
    </div>
  );
}
