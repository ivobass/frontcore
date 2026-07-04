'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell, Sidebar, Topbar, ThemeToggle, UserMenu } from '@frontcore/ui';
import { SessionProvider, useSession } from '../../lib/session-context';
import { getNavItems } from '../../lib/nav-config';
import { AppLink } from '../../components/link';

function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, logout } = useSession();

  return (
    <AppShell
      topbar={
        <Topbar
          start={<span className="font-semibold">FrontRest IA</span>}
          end={
            <>
              <ThemeToggle />
              <UserMenu
                userName={me.user.name ?? me.user.email}
                organizationName={me.organization.name}
                onLogout={logout}
              />
            </>
          }
        />
      }
      sidebar={
        <Sidebar items={getNavItems(pathname ?? '')} renderLink={AppLink} />
      }
    >
      <div className="p-6">{children}</div>
    </AppShell>
  );
}

/** Layout único da área protegida — guard centralizado (Fase 3.6). */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DashboardChrome>{children}</DashboardChrome>
    </SessionProvider>
  );
}
