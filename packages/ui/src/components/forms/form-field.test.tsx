import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from './form-field';

describe('FormField', () => {
  it('renders children', () => {
    render(
      <FormField>
        <label htmlFor="email">Email</label>
        <input id="email" />
      </FormField>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('merges a custom className with the default classes', () => {
    render(<FormField className="custom-field" data-testid="field" />);
    const field = screen.getByTestId('field');
    expect(field).toHaveClass('custom-field');
    expect(field).toHaveClass('flex');
  });
});
