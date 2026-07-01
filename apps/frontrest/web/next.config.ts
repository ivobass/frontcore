import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Em monorepo, o tracing do output standalone precisa da raiz do workspace
  // para incluir dependências fora de apps/frontrest/web (ex.: @frontcore/ui).
  outputFileTracingRoot: path.join(__dirname, '../../../'),
  // Transpila os packages FrontCore consumidos pelo frontend.
  transpilePackages: ['@frontcore/ui'],
};

export default nextConfig;
