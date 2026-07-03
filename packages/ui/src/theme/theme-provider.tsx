'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

/**
 * Theme Provider base do FrontCore. Aplica a classe `dark`/`light` no
 * elemento raiz e persiste a preferência do utilizador. Genérico —
 * qualquer produto FrontCore reutiliza sem alterações.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="frontcore-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
