import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navigation } from './navigation';
import type { NavItem } from '../../types/nav-item';
import type { RenderLink } from '../../types/render-link';

const items: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', active: true },
  { label: 'Definições', href: '/settings' },
];

describe('Navigation', () => {
  it('renders every item as a link, falling back to a native <a>', () => {
    render(<Navigation items={items} />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Definições' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('uses the renderLink prop supplied by the consumer instead of <a>', () => {
    const renderLink: RenderLink = ({ href, children }) => (
      <button data-href={href}>{children}</button>
    );

    render(<Navigation items={items} renderLink={renderLink} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute(
      'data-href',
      '/dashboard',
    );
  });
});
