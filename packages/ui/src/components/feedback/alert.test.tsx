import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

describe('Alert', () => {
  it('renders with role="alert" and its content', () => {
    render(
      <Alert>
        <AlertTitle>Erro</AlertTitle>
        <AlertDescription>Algo correu mal.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
    expect(screen.getByText('Algo correu mal.')).toBeInTheDocument();
  });

  it('applies the destructive variant classes', () => {
    render(<Alert variant="destructive">Erro</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('text-destructive');
  });
});
