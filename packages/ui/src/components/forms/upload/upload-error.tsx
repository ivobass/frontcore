import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../../lib/cn';
import { Alert, AlertDescription } from '../../feedback/alert';

export type UploadErrorProps = HTMLAttributes<HTMLDivElement>;

/** Mensagem de erro de upload — compõe `Alert`/`AlertDescription` (`feedback/`) existentes, sem recriar a semântica de erro. */
export const UploadError = forwardRef<HTMLDivElement, UploadErrorProps>(
  ({ className, children, ...props }, ref) => (
    <Alert ref={ref} variant="destructive" className={cn(className)} {...props}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  ),
);
UploadError.displayName = 'UploadError';
