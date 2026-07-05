import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from './dialog';

function renderDialog() {
  return render(
    <Dialog>
      <DialogTrigger>Abrir</DialogTrigger>
      <DialogContent>
        <DialogTitle>Título do diálogo</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
}

describe('Dialog', () => {
  it('is closed by default and opens when the trigger is clicked', () => {
    renderDialog();
    expect(screen.queryByText('Título do diálogo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Abrir'));

    expect(screen.getByText('Título do diálogo')).toBeInTheDocument();
  });

  it('closes when Escape is pressed — comportamento nativo do Radix', () => {
    renderDialog();
    fireEvent.click(screen.getByText('Abrir'));
    const title = screen.getByText('Título do diálogo');

    fireEvent.keyDown(title, { key: 'Escape', code: 'Escape' });

    expect(screen.queryByText('Título do diálogo')).not.toBeInTheDocument();
  });
});
