import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';
import { Label } from '../primitives';

/** Compõe `Label` de `primitives/` — não reimplementa. */
export interface FieldLabelProps extends ComponentPropsWithoutRef<typeof Label> {
  required?: boolean;
}

export const FieldLabel = forwardRef<HTMLLabelElement, FieldLabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <Label ref={ref} className={cn(className)} {...props}>
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </Label>
  ),
);
FieldLabel.displayName = 'FieldLabel';
