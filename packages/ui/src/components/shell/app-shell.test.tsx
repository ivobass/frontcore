import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './app-shell';

describe('AppShell', () => {
  it('renders the topbar, sidebar and children slots together', () => {
    render(
      <AppShell topbar={<div>Topbar</div>} sidebar={<div>Sidebar</div>}>
        <div>Conteúdo</div>
      </AppShell>,
    );
    expect(screen.getByText('Topbar')).toBeInTheDocument();
    expect(screen.getByText('Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });

  it('renders children even without topbar/sidebar slots', () => {
    render(
      <AppShell>
        <div>Só conteúdo</div>
      </AppShell>,
    );
    expect(screen.getByText('Só conteúdo')).toBeInTheDocument();
  });
});
