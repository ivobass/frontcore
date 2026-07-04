import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Navigation } from '../navigation';
import type { NavItem } from '../../types/nav-item';
import type { RenderLink } from '../../types/render-link';

export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  items: NavItem[];
  renderLink?: RenderLink;
  header?: ReactNode;
  footer?: ReactNode;
}

/** Chrome de app autenticada. Slot `sidebar` do `AppShell`. */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  ({ className, items, renderLink, header, footer, ...props }, ref) => (
    <aside
      ref={ref}
      className={cn(
        'flex w-64 shrink-0 flex-col border-e border-border bg-background',
        className,
      )}
      {...props}
    >
      {header ? <div className="p-4">{header}</div> : null}
      <div className="flex-1 overflow-y-auto p-4">
        <Navigation items={items} renderLink={renderLink} />
      </div>
      {footer ? <div className="p-4">{footer}</div> : null}
    </aside>
  ),
);
Sidebar.displayName = 'Sidebar';
