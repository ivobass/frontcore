import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../primitives';

export interface UserMenuProps extends HTMLAttributes<HTMLDivElement> {
  userName: string;
  organizationName?: string;
  onLogout?: () => void;
}

/**
 * Identidade do utilizador atual + logout, no `Topbar`. Sem dropdown/portal
 * nesta fase — `Overlay` (`DropdownMenu`) ainda não existe; quando existir,
 * pode substituir este layout inline sem alterar a API pública.
 */
export const UserMenu = forwardRef<HTMLDivElement, UserMenuProps>(
  ({ className, userName, organizationName, onLogout, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center gap-3', className)} {...props}>
      <div className="flex flex-col text-end">
        <span className="text-sm font-medium text-foreground">{userName}</span>
        {organizationName ? (
          <span className="text-xs text-muted-foreground">{organizationName}</span>
        ) : null}
      </div>
      {onLogout ? (
        <Button variant="outline" size="sm" onClick={onLogout}>
          Sair
        </Button>
      ) : null}
    </div>
  ),
);
UserMenu.displayName = 'UserMenu';
