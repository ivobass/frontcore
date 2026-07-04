import { Fragment, forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import type { NavItem } from '../../types/nav-item';
import type { RenderLink } from '../../types/render-link';

const defaultRenderLink: RenderLink = ({ href, children }) => (
  <a href={href}>{children}</a>
);

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  items: NavItem[];
  renderLink?: RenderLink;
}

/** Último item de `items` é tratado como a página atual (sem link). */
export const Breadcrumbs = forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ className, items, renderLink = defaultRenderLink, ...props }, ref) => (
    <nav
      ref={ref}
      aria-label="Breadcrumb"
      className={cn('flex items-center text-sm text-muted-foreground', className)}
      {...props}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={item.href}>
            {index > 0 ? <span className="mx-2">/</span> : null}
            {isLast ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              renderLink({
                href: item.href,
                children: (
                  <span className="transition-colors hover:text-foreground">
                    {item.label}
                  </span>
                ),
              })
            )}
          </Fragment>
        );
      })}
    </nav>
  ),
);
Breadcrumbs.displayName = 'Breadcrumbs';
