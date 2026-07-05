import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders children and defaults to a native button element', () => {
    render(<Button>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('merges a custom className with the variant classes', () => {
    render(<Button className="custom-class">Guardar</Button>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('applies the destructive variant classes', () => {
    render(<Button variant="destructive">Apagar</Button>);
    expect(screen.getByRole('button', { name: 'Apagar' })).toHaveClass(
      'bg-destructive',
    );
  });
});
