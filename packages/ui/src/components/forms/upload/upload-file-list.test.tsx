import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UploadFileList } from './upload-file-list';

describe('UploadFileList', () => {
  it('renders the empty label when there are no items', () => {
    render(<UploadFileList items={[]} emptyLabel="Sem ficheiros." />);
    expect(screen.getByText('Sem ficheiros.')).toBeInTheDocument();
  });

  it('renders each item with its name, meta and actions', () => {
    render(
      <UploadFileList
        items={[
          { id: '1', name: 'fatura.pdf', meta: '10 KB', actions: <button>Remover</button> },
        ]}
      />,
    );

    expect(screen.getByText('fatura.pdf')).toBeInTheDocument();
    expect(screen.getByText('10 KB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover' })).toBeInTheDocument();
  });
});
