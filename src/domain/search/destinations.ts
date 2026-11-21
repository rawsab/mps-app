import { HELP_PAGES, HELP_PATH, helpPath } from '@/domain/help/pages';
import type { SearchEntry } from './search';

/**
 * Every page and section coach search can open (decision 0054). To add one: give the target heading
 * an `id`, add an entry here, and put any new shared wording in `SYNONYMS`. A `#id` that never
 * appears on the page logs a warning in development.
 */
export const COACH_DESTINATIONS: readonly SearchEntry[] = [
  // Pages
  { id: 'clients', title: 'Clients', group: 'pages', icon: 'clients', to: '/coach/clients', concepts: ['clients'], suggested: true },
  { id: 'meetings', title: 'Meetings', group: 'pages', icon: 'calendar', to: '/coach/meetings', concepts: ['meetings'], suggested: true },
  { id: 'billing', title: 'Billing', group: 'pages', icon: 'billing', to: '/coach/billing', concepts: ['billing'], suggested: true },
  { id: 'templates', title: 'Templates', group: 'pages', icon: 'templates', to: '/coach/templates', concepts: ['templates'], suggested: true },
  { id: 'activity', title: 'Activity', group: 'pages', icon: 'activity', to: '/coach/reviews', concepts: ['activity'], suggested: true },

  // Meetings sections
  { id: 'calendar', title: 'Calendar', group: 'meetings', icon: 'calendar', to: '/coach/meetings#meeting-calendar', trail: 'Meetings', concepts: ['calendar'], suggested: true },
  { id: 'meeting-requests', title: 'Reschedule requests', group: 'meetings', icon: 'todo', to: '/coach/meetings#meeting-todos', trail: 'Meetings › To-dos', concepts: ['requests'], terms: ['cancellation requests'], suggested: true },
  { id: 'record-attendance', title: 'Record attendance', group: 'meetings', icon: 'attendance', to: '/coach/meetings#record-attendance', trail: 'Meetings', concepts: ['attendance'] },
  { id: 'upcoming-meetings', title: 'Upcoming meetings', group: 'meetings', icon: 'calendar', to: '/coach/meetings#upcoming-meetings', trail: 'Meetings', terms: ['next meeting', 'next session', 'today'] },
  { id: 'time-off', title: 'Time off', group: 'meetings', icon: 'timeOff', to: '/coach/meetings#availability-exceptions', trail: 'Meetings › Time off & extra hours', concepts: ['timeOff'], requires: ['scheduling'] },
  { id: 'extra-hours', title: 'Extra hours', group: 'meetings', icon: 'extraHours', to: '/coach/meetings#availability-exceptions', trail: 'Meetings › Time off & extra hours', concepts: ['extraHours'], requires: ['scheduling'] },

  // Clients page sections
  { id: 'client-invitations', title: 'Client invitations', group: 'clientsPage', icon: 'invite', to: '/coach/clients#clients-follow-up', trail: 'Clients › Follow up', concepts: ['invitations'], terms: ['follow up'], suggested: true },
  { id: 'service-requests', title: 'Service requests', group: 'clientsPage', icon: 'services', to: '/coach/clients#clients-service-requests', trail: 'Clients › Service requests', concepts: ['serviceRequests'] },
  { id: 'to-review', title: 'To review', group: 'clientsPage', icon: 'activity', to: '/coach/clients#clients-to-review', trail: 'Clients', concepts: ['activity'] },

  // Settings
  { id: 'profile', title: 'Profile settings', group: 'settings', icon: 'settings', to: '/coach/profile', concepts: ['profile'] },
  { id: 'time-zone', title: 'Time zone', group: 'settings', icon: 'settings', to: '/coach/profile#profile-time-zone', trail: 'Profile settings', concepts: ['timeZone'] },
  { id: 'availability', title: 'Availability', group: 'settings', icon: 'settings', to: '/coach/profile#profile-availability', trail: 'Profile settings', concepts: ['availability'], requires: ['scheduling'], suggested: true },
  { id: 'session-settings', title: 'Session settings', group: 'settings', icon: 'settings', to: '/coach/profile#profile-sessions', trail: 'Profile settings › Personal training sessions', concepts: ['sessionSettings'], requires: ['scheduling'] },
  { id: 'payment-settings', title: 'E-transfer email', group: 'settings', icon: 'settings', to: '/coach/profile#profile-payments', trail: 'Profile settings › Payments', concepts: ['paymentSettings'] },

  // Help (decision 0057): the pages only. Sections are searched inside Help.
  { id: 'help', title: 'Help', group: 'pages', icon: 'help', to: HELP_PATH, concepts: ['help'] },
  ...HELP_PAGES.map((page): SearchEntry => ({ id: `help-${page.slug}`, title: page.title, group: 'help', icon: 'help', to: helpPath(page.slug), trail: 'Help', concepts: ['help'], terms: [page.summary] })),
];
