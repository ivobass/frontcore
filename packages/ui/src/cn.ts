import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utilitário genérico de composição de classes Tailwind.
 * Base do design system FrontCore — usado por todos os frontends de produto.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
