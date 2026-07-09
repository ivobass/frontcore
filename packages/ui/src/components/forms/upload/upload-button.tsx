import { forwardRef } from 'react';
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { buttonVariants } from '../../primitives/button';
import type { ButtonProps } from '../../primitives/button';
import { Spinner } from '../../feedback/spinner';

export interface UploadButtonProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value' | 'size'>,
    Pick<ButtonProps, 'variant' | 'size'> {
  onFileSelected: (file: File) => void;
  loading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
}

/**
 * Abre o seletor de ficheiro nativo com a aparência de `Button`
 * (`primitives/`), reutilizando `buttonVariants` diretamente em vez de
 * duplicar classes. O elemento interativo real é o `<input type="file">`
 * (`sr-only`) — evita aninhar um `<button>` dentro de um `<label>`.
 */
export const UploadButton = forwardRef<HTMLInputElement, UploadButtonProps>(
  (
    {
      className,
      onFileSelected,
      variant,
      size,
      loading = false,
      loadingLabel = 'A enviar…',
      disabled,
      children = 'Escolher ficheiro',
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      if (file) onFileSelected(file);
      event.target.value = '';
    }

    return (
      <label
        className={cn(
          buttonVariants({ variant, size }),
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isDisabled ? 'pointer-events-none opacity-50' : 'cursor-pointer',
          className,
        )}
      >
        <input
          ref={ref}
          type="file"
          className="sr-only"
          disabled={isDisabled}
          onChange={handleChange}
          {...props}
        />
        {loading ? <Spinner className="h-4 w-4" /> : null}
        {loading ? loadingLabel : children}
      </label>
    );
  },
);
UploadButton.displayName = 'UploadButton';
