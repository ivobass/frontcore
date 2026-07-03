/**
 * Escala de border-radius do FrontCore.
 */
export const radius = {
  none: '0px',
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
} as const;

export type RadiusToken = keyof typeof radius;
