'use client';

import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/cn';
import { zIndex } from '../../tokens/z-index';

/**
 * Encapsula `@radix-ui/react-popover` (ADR-0005) — a API pública é só
 * `Popover`/`PopoverTrigger`/`PopoverContent`; nenhuma app importa Radix
 * diretamente. Fecha com `Esc`/clique fora (comportamento nativo do
 * Radix).
 */
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export type PopoverContentProps = ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
>;

export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = 'center', sideOffset = 4, style, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      style={{ zIndex: zIndex.popover, ...style }}
      className={cn(
        'w-72 rounded-md border border-border bg-card p-4 text-card-foreground shadow-md outline-none transition-[opacity,transform] duration-150 data-[state=closed]:scale-95 data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';
