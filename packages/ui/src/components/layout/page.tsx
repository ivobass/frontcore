import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * Wrapper de conteúdo genérico, utilizável em qualquer contexto (incluindo
 * páginas públicas). Sem título/ações — isso é o `PageHeader` (shell/).
 */
export type PageProps = HTMLAttributes<HTMLDivElement>;

export const Page = forwardRef<HTMLDivElement, PageProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-6 py-6', className)} {...props} />
  ),
);
Page.displayName = 'Page';
