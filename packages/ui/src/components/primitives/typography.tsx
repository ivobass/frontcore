import { forwardRef } from 'react';
import type { ElementType, HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

const DEFAULT_VARIANT = 'body' as const;

const typographyVariants = cva('text-foreground', {
  variants: {
    variant: {
      h1: 'text-4xl font-bold tracking-tight',
      h2: 'text-3xl font-semibold tracking-tight',
      h3: 'text-2xl font-semibold',
      h4: 'text-xl font-semibold',
      body: 'text-base font-normal',
      small: 'text-sm font-normal',
      muted: 'text-sm text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: DEFAULT_VARIANT,
  },
});

type TypographyVariant = NonNullable<
  VariantProps<typeof typographyVariants>['variant']
>;

const defaultElement: Record<TypographyVariant, ElementType> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  body: 'p',
  small: 'small',
  muted: 'p',
};

export interface TypographyProps
  extends HTMLAttributes<HTMLElement>,
    VariantProps<typeof typographyVariants> {
  /** Substitui o elemento HTML renderizado por omissão para a variante. */
  as?: ElementType;
}

export const Typography = forwardRef<HTMLElement, TypographyProps>(
  ({ className, variant, as, ...props }, ref) => {
    const resolvedVariant = variant ?? DEFAULT_VARIANT;
    const Component = as ?? defaultElement[resolvedVariant];
    return (
      <Component
        ref={ref}
        className={cn(typographyVariants({ variant: resolvedVariant }), className)}
        {...props}
      />
    );
  },
);
Typography.displayName = 'Typography';

export { typographyVariants };
