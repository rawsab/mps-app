import { useViewer } from '@/app/auth';
import { EmptyState, PageHeader } from '@/components/ui';
import { todayIn } from '@/features/scheduling/time';
import { useNow } from './api';
import { ClientTodos } from './ClientTodos';
import { ProgressGlance } from './ProgressGlance';
import { ServiceLinks } from './ServiceLinks';
import { UpcomingMeeting } from './UpcomingMeeting';

/**
 * Client Home (FR-03, decision 0042): the next meeting beside the client's services, then today's
 * to-dos and a short look at progress. Each section loads on its own, so one failure never blanks Home.
 */
export function ClientHomePage() {
  const viewer = useViewer();
  const v = viewer.data!;
  const now = useNow();
  const firstName = (v.displayName || v.client?.fullName || '').split(' ')[0];
  const today = todayIn(v.timezone);
  const nutrition = v.services.includes('nutrition');
  const mesocycle = v.services.includes('mesocycle');

  return (
    <div className="grid gap-8">
      <PageHeader
        title={firstName ? `Hi, ${firstName}` : 'Welcome'}
        subtitle={new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: v.timezone }).format(new Date(now))}
      />
      <div className="grid gap-6 md:grid-cols-2 md:gap-9">
        <UpcomingMeeting timeZone={v.timezone} now={now} />
        <ServiceLinks services={v.services} className="border-t border-line pt-6 md:border-l md:border-t-0 md:pl-9 md:pt-0" />
      </div>
      {v.client && (nutrition || mesocycle) ? <>
        <ClientTodos clientId={v.client.id} nutrition={nutrition} mesocycle={mesocycle} today={today} />
        <ProgressGlance clientId={v.client.id} nutrition={nutrition} mesocycle={mesocycle} today={today} />
      </> : null}
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
