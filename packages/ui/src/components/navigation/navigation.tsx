import { Fragment, forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import type { NavItem } from '../../types/nav-item';
import type { RenderLink } from '../../types/render-link';

const defaultRenderLink: RenderLink = ({ href, children }) => (
  <a href={href}>{children}</a>
);

export interface NavigationProps extends HTMLAttributes<HTMLElement> {
  items: NavItem[];
  renderLink?: RenderLink;
}

/**
 * Renderizador de navegação genérico e orientado a configuração (ADR-0002)
 * — sem `next/link`/`useRouter`. `renderLink` é fornecido pela app; sem
 * ele, cai para `<a href>`.
 */
export const Navigation = forwardRef<HTMLElement, NavigationProps>(
  ({ className, items, renderLink = defaultRenderLink, ...props }, ref) => (
    <nav ref={ref} className={cn('flex flex-col gap-1', className)} {...props}>
      {items.map((item) => (
        <Fragment key={item.href}>
          {renderLink({
            href: item.href,
            children: (
              <span
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                  item.active && 'bg-accent text-accent-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </span>
            ),
          })}
        </Fragment>
      ))}
    </nav>
  ),
);
Navigation.displayName = 'Navigation';
