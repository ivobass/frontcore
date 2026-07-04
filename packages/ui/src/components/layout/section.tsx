import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SectionProps = HTMLAttributes<HTMLElement>;

export const Section = forwardRef<HTMLElement, SectionProps>(
  ({ className, ...props }, ref) => (
    <section ref={ref} className={cn('flex flex-col gap-4', className)} {...props} />
  ),
);
Section.displayName = 'Section';
