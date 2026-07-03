/**
 * Design tokens base do FrontCore.
 * Genéricos e neutros; cada produto pode estender o seu tema por cima.
 */
import { palette } from './palette';
import { semantic } from './semantic';
import { spacing } from './spacing';
import { typography } from './typography';
import { radius } from './radius';
import { shadows } from './shadows';
import { zIndex } from './z-index';
import { breakpoints } from './breakpoints';

export * from './palette';
export * from './semantic';
export * from './spacing';
export * from './typography';
export * from './radius';
export * from './shadows';
export * from './z-index';
export * from './breakpoints';

export const tokens = {
  palette,
  semantic,
  spacing,
  typography,
  radius,
  shadows,
  zIndex,
  breakpoints,
} as const;
