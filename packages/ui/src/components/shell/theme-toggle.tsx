'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '../../lib/cn';
import { Button } from '../primitives';

export type ThemeToggleProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Alterna claro/escuro via `next-themes` (já usado pelo `ThemeProvider`). */
export const ThemeToggle = forwardRef<HTMLButtonElement, ThemeToggleProps>(
  ({ className, ...props }, ref) => {
    const { resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    return (
      <Button
        ref={ref}
        type="button"
        variant="ghost"
        size="sm"
        aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className={cn(className)}
        {...props}
      >
        {isDark ? 'Claro' : 'Escuro'}
      </Button>
    );
  },
);
ThemeToggle.displayName = 'ThemeToggle';
