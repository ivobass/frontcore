import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadButton } from './upload-button';

describe('UploadButton', () => {
  it('renders children as the visible label', () => {
    render(<UploadButton onFileSelected={vi.fn()}>Escolher ficheiro</UploadButton>);
    expect(screen.getByText('Escolher ficheiro')).toBeInTheDocument();
  });

  it('calls onFileSelected when a file is chosen', () => {
    const onFileSelected = vi.fn();
    render(<UploadButton onFileSelected={onFileSelected}>Escolher ficheiro</UploadButton>);
    const input = screen.getByLabelText('Escolher ficheiro', { selector: 'input' });
    const file = new File(['conteudo'], 'fatura.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('shows the loading label and disables the input while loading', () => {
    const { container } = render(
      <UploadButton onFileSelected={vi.fn()} loading loadingLabel="A enviar…">
        Escolher ficheiro
      </UploadButton>,
    );

    expect(screen.getByText('A enviar…')).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeDisabled();
  });
});
