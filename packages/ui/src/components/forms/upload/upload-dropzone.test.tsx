import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadDropzone } from './upload-dropzone';

describe('UploadDropzone', () => {
  it('calls onFileSelected when a file is chosen via the input', () => {
    const onFileSelected = vi.fn();
    render(<UploadDropzone onFileSelected={onFileSelected} label="Escolher ficheiro" />);
    const input = screen.getByLabelText('Escolher ficheiro', { selector: 'input' });
    const file = new File(['conteudo'], 'fatura.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('calls onFileSelected when a file is dropped', () => {
    const onFileSelected = vi.fn();
    render(<UploadDropzone onFileSelected={onFileSelected} label="Escolher ficheiro" />);
    const dropzone = screen.getByText('Escolher ficheiro').closest('label')!;
    const file = new File(['conteudo'], 'fatura.pdf', { type: 'application/pdf' });

    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('disables the input and does not call onFileSelected when disabled', () => {
    const onFileSelected = vi.fn();
    render(<UploadDropzone onFileSelected={onFileSelected} label="Escolher ficheiro" disabled />);
    const input = screen.getByLabelText('Escolher ficheiro', { selector: 'input' });

    expect(input).toBeDisabled();

    const dropzone = screen.getByText('Escolher ficheiro').closest('label')!;
    const file = new File(['conteudo'], 'fatura.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    expect(onFileSelected).not.toHaveBeenCalled();
  });

  it('renders the hint when provided', () => {
    render(<UploadDropzone onFileSelected={vi.fn()} label="Escolher ficheiro" hint="PDF até 10 MB" />);
    expect(screen.getByText('PDF até 10 MB')).toBeInTheDocument();
  });
});
