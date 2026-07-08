import { Button } from '@frontcore/ui';

export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  total: number;
  itemLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * Controlo de paginação (Anterior/Seguinte + contagem) partilhado pelas
 * listagens paginadas — fornecedores e faturas — para não duplicar o mesmo
 * bloco em cada página.
 */
export function PaginationControls({
  page,
  totalPages,
  total,
  itemLabel,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Página {page} de {totalPages} — {total} {itemLabel}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={onPrevious}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={onNext}>
          Seguinte
        </Button>
      </div>
    </div>
  );
}
