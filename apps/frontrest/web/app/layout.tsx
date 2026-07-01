import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FrontRest IA',
  description: 'Gestão financeira e operacional de restaurantes — sobre FrontCore',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
