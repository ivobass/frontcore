'use client';

import { forwardRef, useState } from 'react';
import type { ChangeEvent, DragEvent, InputHTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';

export interface UploadDropzoneProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  onFileSelected: (file: File) => void;
  label?: string;
  hint?: string;
}

/**
 * Área de seleção de ficheiro por clique ou drag & drop nativo (sem
 * biblioteca externa). O `<input type="file">` fica visualmente oculto
 * (`sr-only`, nunca `display:none`) — mantém-se focável por teclado, e
 * `Enter`/`Espaço` continuam a abrir o seletor nativo do sistema.
 */
export const UploadDropzone = forwardRef<HTMLInputElement, UploadDropzoneProps>(
  (
    { className, onFileSelected, label = 'Clique ou arraste um ficheiro', hint, disabled, ...props },
    ref,
  ) => {
    const [dragOver, setDragOver] = useState(false);

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      if (file) onFileSelected(file);
      event.target.value = '';
    }

    function handleDrop(event: DragEvent<HTMLLabelElement>) {
      event.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = event.dataTransfer.files?.[0];
      if (file) onFileSelected(file);
    }

    return (
      <label
        aria-disabled={disabled}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-input px-4 py-8 text-center text-sm text-muted-foreground transition-colors',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          !disabled && 'cursor-pointer hover:border-ring hover:text-foreground',
          dragOver && !disabled && 'border-ring bg-accent text-foreground',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={ref}
          type="file"
          className="sr-only"
          disabled={disabled}
          onChange={handleChange}
          {...props}
        />
        <span>{label}</span>
        {hint ? <span className="text-xs">{hint}</span> : null}
      </label>
    );
  },
);
UploadDropzone.displayName = 'UploadDropzone';
