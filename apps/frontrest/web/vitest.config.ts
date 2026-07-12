import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `tsconfig.json` usa `jsx: "preserve"` (exigido pelo compilador do
  // Next.js) — o esbuild do Vitest não lê essa opção da mesma forma e
  // cai para o transform clássico (exige `React` importado em cada
  // ficheiro) sem isto. Só afeta os testes, nunca o build do Next.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
