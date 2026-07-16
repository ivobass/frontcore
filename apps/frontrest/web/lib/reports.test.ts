import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { downloadMonthlyReportCsv, downloadMonthlyReportPdf } from './reports';

describe('downloadMonthlyReportCsv / downloadMonthlyReportPdf', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    clickSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'a') element.click = clickSpy;
      return element;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('faz download do CSV com autenticação, cria e revoga o ObjectURL', async () => {
    const blob = new Blob(['csv content'], { type: 'text/csv' });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(blob, {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="relatorio-financeiro-2026-07.csv"' },
      }),
    );

    await downloadMonthlyReportCsv('token-abc', '2026-07');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/reports/monthly.csv?month=2026-07'),
      expect.objectContaining({ headers: { Authorization: 'Bearer token-abc' } }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    // A revogação só deve acontecer depois do clique ter iniciado o download.
    expect(clickSpy.mock.invocationCallOrder[0]).toBeLessThan(revokeObjectURL.mock.invocationCallOrder[0]);
  });

  it('usa o filename do Content-Disposition quando presente, nunca um filename arbitrário', async () => {
    const blob = new Blob(['csv content'], { type: 'text/csv' });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(blob, {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="relatorio-financeiro-2026-07.csv"' },
      }),
    );

    await downloadMonthlyReportCsv('token-abc', '2026-07');

    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('relatorio-financeiro-2026-07.csv');
  });

  it('lança um erro sanitizado quando a resposta falha (ex. mês inválido)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Mês inválido.' }), { status: 400 }),
    );

    await expect(downloadMonthlyReportCsv('token-abc', 'bad')).rejects.toThrow('Mês inválido.');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('PDF chama o endpoint distinto do CSV', async () => {
    const blob = new Blob(['%PDF-'], { type: 'application/pdf' });
    global.fetch = vi.fn().mockResolvedValue(new Response(blob, { status: 200 }));

    await downloadMonthlyReportPdf('token-abc', '2026-07');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/reports/monthly.pdf?month=2026-07'),
      expect.anything(),
    );
  });
});
