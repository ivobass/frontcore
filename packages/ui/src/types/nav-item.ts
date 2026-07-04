import type { ReactNode } from 'react';

/**
 * Item de navegação genérico e orientado a configuração — usado por
 * `Navigation`, `Breadcrumbs` e `Sidebar`. Não sabe nada sobre rotas
 * concretas de nenhum produto; a app consumidora fornece os valores.
 */
export interface NavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  active?: boolean;
}
