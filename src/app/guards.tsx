import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Alert, Button, Card, Spinner } from '@/components/ui';
import { clientSections } from '@/lib/services';
import { signOut, useAuth, useViewer } from './auth';

/*
 * Route guards decide what to render. They are navigation conveniences only:
 * the database policies are what actually authorize every read and write (PRD §4).
 */

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-4">{children}</div>;
}

export function RequireSignedIn() {
  const auth = useAuth();
  const location = useLocation();
  const viewer = useViewer();
  if (auth.status === 'loading') {
    return (
      <FullPage>
        <Spinner label="Loading" />
      </FullPage>
    );
  }
  if (auth.status === 'signed_out') return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (viewer.isPending) {
    return (
      <FullPage>
        <Spinner label="Loading your account" />
      </FullPage>
    );
  }
  if (viewer.error) {
    return (
      <FullPage>
        <Card className="max-w-sm">
          <Alert title="We could not load your account">The service may be paused or unreachable. Nothing has been lost; try again shortly.</Alert>
          <Button className="mt-4" variant="secondary" onClick={() => void viewer.refetch()}>
            Retry
          </Button>
        </Card>
      </FullPage>
    );
  }
  return <Outlet />;
}

export function NoAccess() {
  return (
    <FullPage>
      <Card className="max-w-sm">
        <h1 className="mb-2 text-lg font-semibold">No active access</h1>
        <p className="mb-4 text-sm text-muted">This account is not linked to an active client or staff role. Contact your coach if this is unexpected.</p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </Card>
    </FullPage>
  );
}

export function HomeRedirect() {
  const viewer = useViewer();
  if (viewer.data?.staffRole) return <Navigate to="/coach/clients" replace />;
  if (viewer.data?.client) return <Navigate to="/home" replace />;
  return <NoAccess />;
}

export function RequireStaff() {
  const viewer = useViewer();
  return viewer.data?.staffRole ? <Outlet /> : <Navigate to="/" replace />;
}

export function RequireClient({ section }: { section?: 'training' | 'nutrition' | 'progress' }) {
  const viewer = useViewer();
  if (!viewer.data?.client) return <Navigate to="/" replace />;
  if (section && !clientSections(viewer.data.services)[section]) return <Navigate to="/home" replace />;
  return <Outlet />;
}
