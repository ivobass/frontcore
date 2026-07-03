/**
 * Tokens semânticos do FrontCore — nomes de intenção alinhados com
 * convenções de design system modernas (compatíveis com shadcn/ui),
 * mapeados para a paleta física. Sem variantes light/dark: essa resolução
 * é responsabilidade do Theme Engine (CSS variables + Theme Provider).
 */
import { palette } from './palette';

export const semantic = {
  background: palette.neutral[0],
  foreground: palette.neutral[900],
  card: palette.neutral[50],
  cardForeground: palette.neutral[900],
  popover: palette.neutral[50],
  popoverForeground: palette.neutral[900],
  primary: palette.neutral[900],
  primaryForeground: palette.neutral[50],
  secondary: palette.neutral[100],
  secondaryForeground: palette.neutral[900],
  muted: palette.neutral[100],
  mutedForeground: palette.neutral[500],
  accent: palette.neutral[100],
  accentForeground: palette.neutral[900],
  destructive: palette.red[600],
  destructiveForeground: palette.neutral[50],
  border: palette.neutral[200],
  input: palette.neutral[200],
  ring: palette.neutral[900],
  success: palette.green[600],
  successForeground: palette.neutral[50],
  warning: palette.yellow[600],
  warningForeground: palette.neutral[900],
  info: palette.blue[600],
  infoForeground: palette.neutral[50],
} as const;

export type SemanticToken = keyof typeof semantic;
