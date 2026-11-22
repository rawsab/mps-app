import type { ReactNode } from 'react';
import { Avatar } from '@/components/Avatar';
import {
  ArrowUpRightIcon, BillingIcon, CalendarIcon, ClientsIcon, HistoryIcon, HomeIcon, MesocycleIcon, MoveIcon, NutritionIcon, ProgressIcon, ReviewsIcon,
  SearchIcon, StopIcon, TemplatesIcon, TrainingIcon,
} from '@/components/icons';
import { Badge, Button, Card, Kbd } from '@/components/ui';
import { statusBadge } from '@/features/clients/ClientsTable';

/*
 * Help topic thumbnails (decision 0057): part of the matching app page, rebuilt from real components
 * with fictional data, in a small browser window. The window sits in from the top and left and runs
 * off the right and bottom. Pictures only: hidden from screen readers and inert.
 */

function BrowserWindow({ path, children }: { path: string; children: ReactNode }) {
  return (
    <span inert className="help-window absolute left-[8%] top-[14%] block w-[36rem] origin-top-left scale-[0.78] overflow-hidden rounded-tl-[10px] text-left">
      <span className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-muted/40" />
          <span className="size-2.5 rounded-full bg-muted/40" />
          <span className="size-2.5 rounded-full bg-muted/40" />
        </span>
        <span className="flex-1 truncate rounded-full bg-ink px-3 py-1 text-xs text-muted">{path}</span>
      </span>
      <span className="block min-h-[22rem] p-5">{children}</span>
    </span>
  );
}

function Title({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <span className="mb-4 block">
      <span className="block text-2xl font-medium tracking-[-0.025em]">{children}</span>
      {subtitle ? <span className="mt-1 block text-sm text-muted">{subtitle}</span> : null}
    </span>
  );
}

const Row = ({ children }: { children: ReactNode }) => <span className="flex items-center gap-3 border-b border-line py-2.5 text-sm last:border-b-0">{children}</span>;

function Sidebar() {
  const items = [
    { label: 'Clients', icon: <ClientsIcon />, active: true },
    { label: 'Meetings', icon: <CalendarIcon />, badge: '3' },
    { label: 'Billing', icon: <BillingIcon /> },
    { label: 'Templates', icon: <TemplatesIcon /> },
    { label: 'Activity', icon: <ReviewsIcon />, badge: '12' },
  ];
  return (
    <span className="flex gap-5">
      <span className="flex w-52 flex-col gap-1 border-r border-line pr-4">
        <span className="mb-2 flex min-h-11 items-center gap-3 rounded-card border border-line px-3 text-sm text-muted"><SearchIcon /><span className="flex-1">Search</span><Kbd>⌘K</Kbd></span>
        {items.map((i) => (
          <span key={i.label} className={`flex min-h-11 items-center gap-3 rounded-card px-3 text-sm ${i.active ? 'bg-surface-raised font-medium text-text' : 'text-muted'}`}>
            <span className={i.active ? 'text-gold-fg' : ''}>{i.icon}</span>
            <span className="flex-1">{i.label}</span>
            {i.badge ? <span className="rounded-full bg-gold/15 px-2 text-xs font-medium text-gold-fg">{i.badge}</span> : null}
          </span>
        ))}
      </span>
      <span className="flex-1"><Title>Clients</Title><Row>Avery Chen</Row><Row>Sam Okafor</Row><Row>Riley Moreau</Row></span>
    </span>
  );
}

function Profile() {
  return (
    <>
      <Title subtitle="Manage your personal details, profile picture and time zone.">Profile settings</Title>
      <Card as="div">
        <span className="flex items-center gap-4">
          <Avatar name="Jordan Avery" className="size-16" />
          <span><span className="block font-medium">Jordan Avery</span><span className="block text-sm text-muted">America/Toronto</span></span>
        </span>
        <span className="mt-4 block text-sm font-medium">Meeting link</span>
        <span className="mt-1.5 block rounded-card border border-line bg-ink px-3 py-2.5 text-sm text-muted">https://meet.example.test/jordan</span>
      </Card>
    </>
  );
}

function Clients() {
  const rows = [['Avery Chen', 'active', 'Mesocycle · Nutrition'], ['Sam Okafor', 'invited', 'Personal training'], ['Riley Moreau', 'pending', 'Mesocycle'], ['Jo Lindqvist', 'active', 'Nutrition']] as const;
  return (
    <>
      <span className="flex items-start justify-between"><Title>Clients</Title><Button>New client</Button></span>
      <Card as="div" padding="sm">
        {rows.map(([name, status, services]) => (
          <Row key={name}><Avatar name={name} className="size-8" /><span className="w-32 font-medium">{name}</span><span className="flex-1 text-muted">{services}</span>{statusBadge(status)}</Row>
        ))}
      </Card>
    </>
  );
}

function Activity() {
  return (
    <>
      <Title subtitle="Workouts, nutrition logs, and meeting and service requests.">Activity</Title>
      <Row><Avatar name="Avery Chen" className="size-8" /><span className="flex-1">Avery Chen completed Week 2 · Day 1</span><Badge tone="success">Completed</Badge></Row>
      <Row><Avatar name="Sam Okafor" className="size-8" /><span className="flex-1">Sam Okafor asked to reschedule</span><Badge tone="info">Reschedule request</Badge></Row>
      <Row><Avatar name="Jo Lindqvist" className="size-8" /><span className="flex-1">Jo Lindqvist logged nutrition</span><Badge>Partial entry</Badge></Row>
      <Row><Avatar name="Riley Moreau" className="size-8" /><span className="flex-1">Riley Moreau sent a payment</span><Badge tone="gold">Payment</Badge></Row>
    </>
  );
}

function Sheet({ head, rows, highlight }: { head: string[]; rows: string[][]; highlight?: [number, number] }) {
  return (
    <span className="block overflow-hidden rounded-card border border-line">
      <span className="grid bg-gold/20 text-xs font-medium" style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0, 1fr))` }}>
        {head.map((h) => <span key={h} className="border-r border-line px-2 py-1.5 last:border-r-0">{h}</span>)}
      </span>
      {rows.map((row, r) => (
        <span key={r} className="grid border-t border-line text-xs" style={{ gridTemplateColumns: `repeat(${head.length}, minmax(0, 1fr))` }}>
          {row.map((cell, c) => (
            <span key={c} className={`truncate border-r border-line px-2 py-1.5 last:border-r-0 ${highlight?.[0] === r && highlight[1] === c ? 'bg-gold/15 outline outline-2 -outline-offset-2 outline-gold' : ''}`}>{cell}</span>
          ))}
        </span>
      ))}
    </span>
  );
}

function Mesocycle() {
  return (
    <>
      <Title subtitle="Push · Pull · Legs">Hypertrophy</Title>
      <span className="mb-2 block text-sm font-medium">Week 1</span>
      <Sheet head={['Exercise', 'RIR goal', 'Muscles', 'Sets', 'Reps']} highlight={[1, 4]}
        rows={[['Bench press', '2', 'Chest', '3', '8-10'], ['Incline press', '1-2', 'Chest', '3', '10 / 8 / 6'], ['Cable fly', '1', 'Chest', '2', '12-15'], ['Triceps pushdown', '1', 'Triceps', '3', '12']]} />
    </>
  );
}

function PersonalTraining() {
  const stats = [['Sessions completed', '24'], ['Weekly streak', '6'], ['Attendance', '92%']];
  return (
    <>
      <Title>Personal training</Title>
      <span className="grid grid-cols-3 gap-3">
        {stats.map(([label, value]) => <Card key={label} as="div" padding="sm"><span className="block text-xs text-muted">{label}</span><span className="mt-1 block text-2xl font-medium">{value}</span></Card>)}
      </span>
      <span className="mt-4 flex h-24 items-end gap-2">
        {[2, 1, 2, 2, 0, 1, 2, 2, 1, 2, 2, 2].map((n, i) => <span key={i} className="flex-1 rounded-t-[3px] bg-chart-bar" style={{ height: `${n ? n * 45 : 4}%`, opacity: n ? 1 : 0.3 }} />)}
      </span>
    </>
  );
}

function Nutrition() {
  return (
    <>
      <Title subtitle="Week 3 · lb">Lean gain</Title>
      <Sheet head={['Date', 'Weight', 'Calories', 'Output', 'Balance']} highlight={[2, 2]}
        rows={[['Mon', '172.4', '2,850', '2,600', '+250'], ['Tue', '172.1', '2,790', '2,640', '+150'], ['Wed', '172.6', '', '2,580', ''], ['Thu', '172.9', '2,910', '2,700', '+210']]} />
    </>
  );
}

function Meetings() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const blocks: Record<string, [number, string][]> = { Mon: [[0, 'Avery'], [1, 'Sam']], Tue: [[2, 'Jo']], Wed: [[0, 'Riley'], [1, 'Avery'], [2, 'Sam']], Thu: [], Fri: [[1, 'Jo'], [2, 'Riley']] };
  return (
    <>
      <Title>Meetings</Title>
      <span className="grid grid-cols-5 gap-2">
        {days.map((d) => (
          <span key={d} className="flex flex-col gap-2">
            <span className="text-center text-xs text-muted">{d}</span>
            {[0, 1, 2].map((slot) => {
              const block = blocks[d]?.find(([s]) => s === slot);
              return <span key={slot} className={`h-14 rounded-card border px-2 py-1 text-xs ${block ? 'border-gold bg-gold/15' : 'border-line'}`}>{block ? block[1] : ''}</span>;
            })}
          </span>
        ))}
      </span>
    </>
  );
}

function Billing() {
  return (
    <>
      <Title subtitle="Charges and payments for your clients, in CAD.">Billing</Title>
      <Card as="div" padding="sm">
        <Row><span className="flex-1 font-medium">Avery Chen</span><Badge tone="danger">Overdue</Badge><span className="w-20 text-right">$300.00</span></Row>
        <Row><span className="flex-1 font-medium">Sam Okafor</span><span className="w-20 text-right">$140.00</span></Row>
        <Row><span className="flex-1 font-medium">Jo Lindqvist</span><Badge tone="success">In credit</Badge><span className="w-20 text-right">$0.00</span></Row>
      </Card>
    </>
  );
}

function Roles() {
  const rows = [['Avery Chen', 'Jordan Avery'], ['Sam Okafor', 'Priya Nair'], ['Riley Moreau', 'Jordan Avery'], ['Jo Lindqvist', 'Priya Nair']] as const;
  const menu = [
    { label: 'View client', icon: <ArrowUpRightIcon /> },
    { label: 'See recent updates', icon: <HistoryIcon /> },
    { label: 'Transfer client', icon: <MoveIcon />, separator: true },
    { label: 'Disable', icon: <StopIcon />, danger: true },
  ];
  return (
    <>
      <Title>Clients</Title>
      <Card as="div" padding="sm" className="relative">
        {rows.map(([name, coach], i) => (
          <Row key={name}><Avatar name={name} className="size-8" /><span className={`w-32 font-medium ${i === 1 ? 'text-gold-fg' : ''}`}>{name}</span><span className="flex-1 text-muted">{coach}</span></Row>
        ))}
        {/* The admin's row menu, open on the second row. */}
        <span className="absolute left-40 top-16 w-52 rounded-card border border-line bg-surface p-1 text-sm shadow-popover">
          {menu.map((item) => (
            <span key={item.label} className={`flex min-h-9 items-center gap-2.5 rounded-[5px] px-2.5 ${item.separator ? 'mt-1 border-t border-line pt-1' : ''} ${item.danger ? 'text-danger' : ''} ${item.label === 'Transfer client' ? 'bg-surface-raised' : ''}`}>
              <span className="text-muted">{item.icon}</span>{item.label}
            </span>
          ))}
        </span>
      </Card>
    </>
  );
}

function ClientHome() {
  const tabs = [
    { label: 'Home', icon: <HomeIcon />, active: true },
    { label: 'Mesocycle', icon: <MesocycleIcon /> },
    { label: 'PT', icon: <TrainingIcon /> },
    { label: 'Nutrition', icon: <NutritionIcon /> },
    { label: 'Progress', icon: <ProgressIcon /> },
  ];
  return (
    <>
      <span className="mb-5 flex gap-1 border-b border-line pb-2">
        {tabs.map((t) => (
          <span key={t.label} className={`flex items-center gap-1.5 rounded-card px-2.5 py-1.5 text-xs ${t.active ? 'bg-surface-raised font-medium text-text' : 'text-muted'}`}>
            <span className={t.active ? 'text-gold-fg' : ''}>{t.icon}</span>{t.label}
          </span>
        ))}
      </span>
      <Title subtitle="Saturday, November 21">Hi, Avery</Title>
      <span className="flex items-center justify-between border-b border-line pb-4">
        <span><span className="block text-sm text-muted">You owe</span><span className="block text-3xl font-semibold tabular-nums">$140.00</span></span>
        <Button>Pay</Button>
      </span>
      <span className="mt-4 block text-sm font-medium">Next meeting</span>
      <span className="mt-1 block text-sm text-muted">Tue, Nov 24 · 7:00 to 8:00 AM</span>
      <span className="mt-3 flex gap-2"><Button variant="ghost">Reschedule</Button><Button variant="ghost-danger">Cancel meeting</Button></span>
    </>
  );
}

function Availability() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  // Hours 9 to 5 as eight rows: working hours, a booked meeting, and open start times.
  const booked: Record<string, number[]> = { Mon: [1], Tue: [3, 4], Wed: [0], Thu: [], Fri: [5] };
  const off: Record<string, number[]> = { Thu: [0, 1, 2, 3, 4, 5, 6, 7] };
  return (
    <>
      <Title subtitle="Mon to Fri 9:00 AM to 5:00 PM">Availability</Title>
      <span className="grid grid-cols-5 gap-2">
        {days.map((d) => (
          <span key={d} className="flex flex-col gap-1">
            <span className="text-center text-xs text-muted">{d}</span>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((h) => {
              const kind = off[d]?.includes(h) ? 'off' : booked[d]?.includes(h) ? 'booked' : 'open';
              return <span key={h} className={`h-6 rounded-[4px] border text-[10px] leading-6 ${kind === 'booked' ? 'border-gold bg-gold/25' : kind === 'off' ? 'calendar-unavailable border-line' : 'border-gold/40 bg-gold/5'}`} />;
            })}
          </span>
        ))}
      </span>
    </>
  );
}

const THUMBNAILS: Record<string, { path: string; page: () => ReactNode }> = {
  'getting-started': { path: '/coach/clients', page: Sidebar },
  'roles-and-permissions': { path: '/coach/clients', page: Roles },
  'what-clients-see': { path: '/home', page: ClientHome },
  'profile-settings': { path: '/coach/profile', page: Profile },
  clients: { path: '/coach/clients', page: Clients },
  activity: { path: '/coach/reviews', page: Activity },
  mesocycle: { path: '/coach/clients/avery/programs', page: Mesocycle },
  'personal-training': { path: '/personal-training', page: PersonalTraining },
  nutrition: { path: '/coach/clients/jo/nutrition', page: Nutrition },
  meetings: { path: '/coach/meetings', page: Meetings },
  availability: { path: '/coach/profile', page: Availability },
  billing: { path: '/coach/billing', page: Billing },
};

/** A topic's thumbnail: the gold and black frame with a window onto its app page. */
export function HelpThumbnail({ slug }: { slug: string }) {
  const thumb = THUMBNAILS[slug];
  const Page = thumb?.page;
  return (
    <span aria-hidden className="help-thumb relative block aspect-[16/9] overflow-hidden">
      {thumb && Page ? <BrowserWindow path={thumb.path}><Page /></BrowserWindow> : null}
    </span>
  );
}
