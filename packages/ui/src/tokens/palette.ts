/**
 * Paleta de cores físicas do FrontCore — valores brutos, sem significado
 * semântico. Os tokens semânticos (`./semantic.ts`) referenciam estes
 * valores; a resolução light/dark fica para o Theme Provider.
 */

export const neutral = {
  0: '#ffffff',
  50: '#fafafa',
  100: '#f5f5f5',
  200: '#e5e5e5',
  300: '#d4d4d4',
  400: '#a3a3a3',
  500: '#737373',
  600: '#525252',
  700: '#404040',
  800: '#262626',
  900: '#171717',
  950: '#0a0a0a',
} as const;

export const green = {
  500: '#22c55e',
  600: '#16a34a',
} as const;

export const yellow = {
  400: '#eab308',
  600: '#ca8a04',
} as const;

export const red = {
  500: '#ef4444',
  600: '#dc2626',
} as const;

export const blue = {
  500: '#3b82f6',
  600: '#2563eb',
} as const;

export const palette = {
  neutral,
  green,
  yellow,
  red,
  blue,
} as const;
