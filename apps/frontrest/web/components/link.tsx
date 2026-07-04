import NextLink from 'next/link';
import type { ReactNode } from 'react';

/**
 * Implementação FrontRest do padrão `renderLink` (ADR-0002) — envolve
 * `next/link` uma única vez e é passada aos componentes de navegação de
 * `@frontcore/ui`, que nunca importam Next.js diretamente.
 */
export function AppLink({ href, children }: { href: string; children: ReactNode }) {
  return <NextLink href={href}>{children}</NextLink>;
}
