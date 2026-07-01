/**
 * Design tokens base do FrontCore.
 * Genéricos e neutros; cada produto pode estender o seu tema por cima.
 */
export const tokens = {
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
  },
  status: {
    up: 'bg-green-500',
    down: 'bg-red-500',
    checking: 'bg-yellow-400',
  },
} as const;

export type StatusKey = keyof typeof tokens.status;
