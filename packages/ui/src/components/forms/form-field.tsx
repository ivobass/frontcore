import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * Agrupa label/controlo/hint/error com espaçamento vertical consistente.
 * Não faz wiring automático de `id`/`aria-describedby` — o consumidor liga
 * `htmlFor`/`id`/`aria-describedby` manualmente, tal como já acontece hoje
 * entre `Label` e `Input`.
 */
export type FormFieldProps = HTMLAttributes<HTMLDivElement>;

export const FormField = forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-2', className)} {...props} />
  ),
);
FormField.displayName = 'FormField';
