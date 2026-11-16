import { useViewer } from '@/app/auth';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { SERVICE_LABELS } from '@/lib/services';

/**
 * Client Home (FR-03). Programs, sessions and nutrition logs do not exist until M3–M5, so this
 * shows only what is real: the client's name and services, plus honest empty states.
 * No placeholder metrics are invented.
 */
export function ClientHomePage() {
  const viewer = useViewer();
  const v = viewer.data!;
  const firstName = (v.displayName || v.client?.fullName || '').split(' ')[0];

  return (
    <div className="grid gap-4">
      <PageHeader
        title={firstName ? `Hi, ${firstName}` : 'Welcome'}
        subtitle={new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
      />
      <Card>
        <h2 className="mb-2 text-sm font-medium text-muted">Your services</h2>
        {v.services.length ? (
          <div className="flex flex-wrap gap-2">
            {v.services.map((s) => (
              <Badge key={s} tone="gold">
                {SERVICE_LABELS[s]}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No services are active yet.</p>
        )}
      </Card>
      <EmptyState title="Nothing to do yet">
        Your coach hasn’t published a program for you. When they do, your next workout or nutrition entry will show up here.
      </EmptyState>
    </div>
  );
}

export function ClientSectionPage({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState title="Not available yet">{body}</EmptyState>
    </div>
  );
}

export function CoachPlaceholderPage({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <EmptyState title="Planned for a later milestone">{body}</EmptyState>
    </div>
  );
}
