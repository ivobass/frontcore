import type { ReactNode } from 'react';

/**
 * Padrão de composição de navegação (ADR-0002) — a app consumidora
 * implementa esta função uma única vez (envolvendo `next/link`) e passa-a
 * a componentes de navegação. Sem valor fornecido, os componentes caem
 * para `<a href>` simples.
 */
export type RenderLink = (props: {
  href: string;
  children: ReactNode;
}) => ReactNode;
