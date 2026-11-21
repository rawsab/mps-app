import { fileURLToPath, URL } from 'node:url';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import remarkGfm from 'remark-gfm';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Help pages (decision 0057). `?raw` imports are the page text for Help search, so they stay uncompiled. */
function helpMdx(): Plugin {
  const plugin = mdx({ remarkPlugins: [remarkGfm] }) as Plugin & { transform: (this: unknown, code: string, id: string) => unknown };
  const transform = plugin.transform;
  return { ...plugin, enforce: 'pre', transform(code, id) { return id.includes('?raw') ? null : transform.call(this, code, id); } } as Plugin;
}

export default defineConfig({
  plugins: [helpMdx(), react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/domain/**/*.test.ts', 'tests/imports/**/*.test.ts', 'tests/lib/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          // Hits the running local Supabase stack with real sign-ins (NFR-01 direct-request checks).
          name: 'api',
          include: ['tests/policies/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
        },
      },
    ],
  },
});
