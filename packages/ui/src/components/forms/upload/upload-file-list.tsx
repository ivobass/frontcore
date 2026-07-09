import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../../lib/cn';

export interface UploadFileListItem {
  id: string;
  name: string;
  meta?: ReactNode;
  actions?: ReactNode;
}

export interface UploadFileListProps extends HTMLAttributes<HTMLUListElement> {
  items: UploadFileListItem[];
  emptyLabel?: string;
}

/**
 * Lista genérica de ficheiros — sem conhecimento de domínio. `meta`
 * (ex. tamanho, data) e `actions` (ex. descarregar, remover) são
 * fornecidos pelo consumidor via slot, tal como o padrão já usado em
 * `EmptyState`.
 */
export const UploadFileList = forwardRef<HTMLUListElement, UploadFileListProps>(
  ({ className, items, emptyLabel = 'Sem ficheiros.', ...props }, ref) => (
    <ul ref={ref} className={cn('flex flex-col gap-2', className)} {...props}>
      {items.length === 0 ? (
        <li className="text-sm text-muted-foreground">{emptyLabel}</li>
      ) : (
        items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">{item.name}</span>
              {item.meta ? (
                <span className="text-xs text-muted-foreground">{item.meta}</span>
              ) : null}
            </div>
            {item.actions ? (
              <div className="flex shrink-0 items-center gap-1">{item.actions}</div>
            ) : null}
          </li>
        ))
      )}
    </ul>
  ),
);
UploadFileList.displayName = 'UploadFileList';
