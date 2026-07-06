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
    { label: 'Definições', href: '/settings', active: pathname === '/settings' },
  ];
}
