/**
 * Escala semântica de camadas (z-index) do FrontCore.
 * Apenas os valores — o uso concreto entra com os componentes de sobreposição
 * (dropdown, modal, toast, etc.) em fases futuras.
 */
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
} as const;

export type ZIndexToken = keyof typeof zIndex;
