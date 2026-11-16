import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from './app/auth';
import { router } from './app/router';
import { envResult } from './lib/env';
import '@fontsource-variable/hanken-grotesk';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

function ConfigError({ problems }: { problems: string[] }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div role="alert" className="max-w-md rounded-card border border-danger/50 bg-surface p-5">
        <h1 className="mb-2 text-lg font-semibold text-danger">App configuration is incomplete</h1>
        <ul className="list-disc pl-5 text-sm text-muted">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">See docs/setup.md. The app does not fall back to demo data.</p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {envResult.ok ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <ConfigError problems={envResult.problems} />
    )}
  </StrictMode>,
);
