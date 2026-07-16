import type { NavItem } from '@frontcore/ui';

/** Navegação da área protegida do FrontRest. Específico do produto. */
export function getNavItems(pathname: string): NavItem[] {
  return [
    { label: 'Dashboard', href: '/dashboard', active: pathname === '/dashboard' },
    {
      label: 'Fornecedores',
      href: '/suppliers',
      active: pathname === '/suppliers',
    },
    {
      label: 'Categorias de Despesa',
      href: '/expense-categories',
      active: pathname === '/expense-categories',
    },
    {
      label: 'Faturas',
      href: '/invoices',
      active: pathname === '/invoices',
    },
    {
      label: 'Rascunhos de Fatura',
      href: '/invoice-drafts',
      active: pathname === '/invoice-drafts',
    },
    {
      label: 'Assistente IA',
      href: '/ai/chat',
      active: pathname === '/ai/chat',
    },
    { label: 'Definições', href: '/settings', active: pathname === '/settings' },
  ];
}
