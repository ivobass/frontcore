import type { Metadata } from 'next';
import { ThemeProvider } from '@frontcore/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'FrontRest IA',
  description: 'Gestão financeira e operacional de restaurantes — sobre FrontCore',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
