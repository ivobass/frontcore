'use client';

import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/cn';
import { zIndex } from '../../tokens/z-index';

/**
 * Encapsula `@radix-ui/react-tooltip` (ADR-0005) — a API pública é só
 * `Tooltip`/`TooltipTrigger`/`TooltipContent`/`TooltipProvider`; nenhuma
 * app importa Radix diretamente. `TooltipProvider` deve envolver a app
 * uma única vez (tal como `ThemeProvider`) antes de qualquer `Tooltip`
 * ser usado — não é composto automaticamente aqui.
 */
export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
>;

export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, style, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      style={{ zIndex: zIndex.tooltip, ...style }}
      className={cn(
        'rounded-md border border-border bg-card px-3 py-1.5 text-xs text-card-foreground shadow-md transition-[opacity,transform] duration-150 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';
