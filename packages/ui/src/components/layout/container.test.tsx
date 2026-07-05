import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Container } from './container';

describe('Container', () => {
  it('renders children', () => {
    render(<Container>Conteúdo</Container>);
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });

  it('merges a custom className with the default classes', () => {
    render(<Container className="custom-container" data-testid="container" />);
    const container = screen.getByTestId('container');
    expect(container).toHaveClass('custom-container');
    expect(container).toHaveClass('mx-auto');
  });
});
