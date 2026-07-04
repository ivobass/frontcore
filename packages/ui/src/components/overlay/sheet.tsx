'use client';

import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../../lib/cn';
import { zIndex } from '../../tokens/z-index';

/**
 * Encapsula `@radix-ui/react-dialog` (ADR-0005) — mesmo primitivo do
 * `Dialog`, apresentação diferente (painel lateral). Ficheiro próprio,
 * sem reexportar de `dialog.tsx`, para manter as duas APIs públicas
 * independentes. Fecha com `Esc`/clique fora (comportamento nativo do
 * Radix, não reimplementado).
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sheetSideClasses = {
  right:
    'inset-y-0 end-0 h-full w-full max-w-sm border-s data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
  left: 'inset-y-0 start-0 h-full w-full max-w-sm border-e data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0',
  top: 'inset-x-0 top-0 w-full border-b data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0',
  bottom:
    'inset-x-0 bottom-0 w-full border-t data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
} as const;

export interface SheetContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: keyof typeof sheetSideClasses;
}

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, side = 'right', children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      style={{ zIndex: zIndex.overlay }}
      className="fixed inset-0 bg-black/50 transition-opacity duration-150 data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
    />
    <DialogPrimitive.Content
      ref={ref}
      style={{ zIndex: zIndex.modal }}
      className={cn(
        'fixed flex flex-col gap-4 border-border bg-card p-6 text-card-foreground shadow-lg transition-transform duration-200',
        sheetSideClasses[side],
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute end-4 top-4 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

export type SheetHeaderProps = HTMLAttributes<HTMLDivElement>;

export const SheetHeader = forwardRef<HTMLDivElement, SheetHeaderProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props} />
  ),
);
SheetHeader.displayName = 'SheetHeader';

export type SheetFooterProps = HTMLAttributes<HTMLDivElement>;

export const SheetFooter = forwardRef<HTMLDivElement, SheetFooterProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mt-auto flex items-center justify-end gap-2', className)}
      {...props}
    />
  ),
);
SheetFooter.displayName = 'SheetFooter';

export type SheetTitleProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Title>;

export const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  SheetTitleProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

export type SheetDescriptionProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Description
>;

export const SheetDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  SheetDescriptionProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';
