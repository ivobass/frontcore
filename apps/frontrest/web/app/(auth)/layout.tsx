import type { ReactNode } from 'react';
import { Container, Page } from '@frontcore/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Page className="min-h-screen justify-center py-0">
      <Container className="flex max-w-sm flex-col gap-6">{children}</Container>
    </Page>
  );
}
