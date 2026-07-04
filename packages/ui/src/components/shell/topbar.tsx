import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TopbarProps extends HTMLAttributes<HTMLElement> {
  start?: ReactNode;
  end?: ReactNode;
}

/** Chrome de app autenticada. Slot `topbar` do `AppShell`. */
export const Topbar = forwardRef<HTMLElement, TopbarProps>(
  ({ className, start, end, children, ...props }, ref) => (
    <header
      ref={ref}
      className={cn(
        'flex h-16 shrink-0 items-center justify-between border-b border-border bg-background px-4',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3">{start}</div>
      {children}
      <div className="flex items-center gap-3">{end}</div>
    </header>
  ),
);
Topbar.displayName = 'Topbar';
