import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Alert, Button, Card } from '@/components/ui';
import { LoadingRegion, SkeletonHeader, SkeletonCard } from '@/components/Skeleton';
import { clientSections, type ClientSection } from '@/lib/services';
import { signOut, useAuth, useViewer } from './auth';

/*
 * Route guards decide what to render. They are navigation conveniences only:
 * the database policies are what actually authorize every read and write (PRD §4).
 */

/**
 * The app's frame while the session and account load. Coach and client layouts differ and neither
 * is known yet, so it's the shared top bar and a page of placeholders.
 */
function StartupSkeleton({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-ink">
        <div className="mx-auto flex max-w-[70rem] items-center px-4">
          <img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo my-3 h-8 w-auto max-w-[45vw] sm:max-w-none" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[70rem] flex-1 px-4 py-8">
        <LoadingRegion label={label} className="grid gap-5">
          <SkeletonHeader />
          <div className="grid gap-5 md:grid-cols-2">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </div>
        </LoadingRegion>
      </main>
    </div>
  );
}

function FullPage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center px-4">{children}</div>;
}

export function RequireSignedIn() {
  const auth = useAuth();
  const location = useLocation();
  const viewer = useViewer();
  if (auth.status === 'loading') {
    return <StartupSkeleton label="Loading" />;
  }
  if (auth.status === 'signed_out') return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (viewer.isPending) {
    return <StartupSkeleton label="Loading your account" />;
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

export function RequireClient({ section }: { section?: ClientSection }) {
  const viewer = useViewer();
  if (!viewer.data?.client) return <Navigate to="/" replace />;
  if (section && !clientSections(viewer.data.services)[section]) return <Navigate to="/home" replace />;
  return <Outlet />;
}
