import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Chrome de app autenticada. Slots genéricos — `Sidebar`/`Topbar` ainda não
 * existem (fase futura); `AppShell` só assume que recebe conteúdo `ReactNode`
 * para cada slot, sem depender de componentes concretos ainda por construir.
 */
export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  topbar?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
}

export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(
  ({ className, topbar, sidebar, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex min-h-screen flex-col bg-background', className)}
      {...props}
    >
      {topbar}
      <div className="flex flex-1">
        {sidebar}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  ),
);
AppShell.displayName = 'AppShell';
