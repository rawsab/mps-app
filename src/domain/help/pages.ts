/**
 * The coach Help pages, in reading order (decision 0057). Each slug has a file at
 * `src/features/help/content/<slug>.mdx`; a unit test keeps the two in step. Text shared by several
 * pages lives in `content/shared/` and isn't a page.
 */
export type HelpGroup = 'start' | 'clients' | 'programs' | 'business';

export type HelpPage = { slug: string; title: string; summary: string; group: HelpGroup };

export const HELP_GROUP_LABELS: Record<HelpGroup, string> = {
  start: 'Start here',
  clients: 'Clients',
  programs: 'Programs',
  business: 'Meetings and billing',
};

export const HELP_PAGES: readonly HelpPage[] = [
  { slug: 'getting-started', title: 'Getting started', summary: 'The sidebar, search, and how the workspace fits together.', group: 'start' },
  { slug: 'roles-and-permissions', title: 'Roles and permissions', summary: 'What coaches and administrators can each do.', group: 'start' },
  { slug: 'what-clients-see', title: 'What clients see', summary: 'The client app: their tabs, logging, requests and paying.', group: 'start' },
  { slug: 'profile-settings', title: 'Profile settings', summary: 'Your picture, time zone, meeting link and e-transfer email.', group: 'start' },
  { slug: 'clients', title: 'Clients', summary: 'Add clients, invite them, and manage their services.', group: 'clients' },
  { slug: 'activity', title: 'Activity', summary: 'Workouts, logs and requests from your clients.', group: 'clients' },
  { slug: 'mesocycle', title: 'Mesocycle', summary: 'Training blocks the client logs set by set, with muscle totals.', group: 'programs' },
  { slug: 'personal-training', title: 'Personal training', summary: 'Programs for your sessions, and how attendance tracks progress.', group: 'programs' },
  { slug: 'nutrition', title: 'Nutrition', summary: 'Nutritional programs, daily entries and corrections.', group: 'programs' },
  { slug: 'meetings', title: 'Meetings', summary: 'Scheduling, repeating sessions, requests and attendance.', group: 'business' },
  { slug: 'availability', title: 'Availability and open times', summary: 'Working hours, time off and the times clients can pick.', group: 'business' },
  { slug: 'billing', title: 'Billing', summary: 'Prices, charges, payments and credits.', group: 'business' },
];

export const HELP_PATH = '/coach/help';

export const helpPath = (slug: string) => `${HELP_PATH}/${slug}`;
