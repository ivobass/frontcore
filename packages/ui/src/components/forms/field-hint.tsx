import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type FieldHintProps = HTMLAttributes<HTMLParagraphElement>;

export const FieldHint = forwardRef<HTMLParagraphElement, FieldHintProps>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  ),
);
FieldHint.displayName = 'FieldHint';
