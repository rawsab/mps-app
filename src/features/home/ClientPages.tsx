import { useViewer } from '@/app/auth';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { SERVICE_LABELS } from '@/lib/services';
import { NutritionHomeTask } from '@/features/nutrition/NutritionPages';

/**
 * Client Home (FR-03): nutrition tasks use persisted daily records. Training has its own view;
 * schedule-derived workout tasks remain a later increment.
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
      {v.services.includes('nutrition') ? <NutritionHomeTask /> : null}
      {v.services.some((s) => s !== 'nutrition') ? <EmptyState title="Your training">
        Open Training to see your published programs and saved workouts.
      </EmptyState> : null}
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
