import { forwardRef } from 'react';
import type { SVGAttributes } from 'react';
import { cn } from '../../lib/cn';

/**
 * Indicador de loading. SVG desenhado à mão — sem dependência de
 * biblioteca de ícones.
 */
export type SpinnerProps = SVGAttributes<SVGSVGElement>;

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="A carregar"
      className={cn('h-4 w-4 animate-spin text-current', className)}
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  ),
);
Spinner.displayName = 'Spinner';
