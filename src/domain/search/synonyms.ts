/**
 * Other words coaches use for things in the app, by concept. Destinations list the concepts they
 * cover, so a synonym added here reaches every destination that uses it. Typos and partial words
 * are handled by the matcher; list real alternatives and natural phrasings here.
 */
export const SYNONYMS = {
  clients: ['client', 'customers', 'athletes', 'members', 'people', 'roster', 'client list'],
  meetings: ['meeting', 'sessions', 'session', 'appointments', 'bookings', 'pt sessions', 'personal training', 'calls', 'schedule'],
  calendar: ['schedule', 'agenda', 'month view', 'week view', 'day view', 'upcoming'],
  requests: ['reschedule', 'rescheduling', 'reschedule requests', 'cancellation requests', 'cancel', 'move a session', 'change a session time', 'to-dos', 'todos', 'waiting'],
  attendance: ['attended', 'no-show', 'no show', 'mark attendance', 'past sessions', 'record attendance'],
  timeOff: ['vacation', 'holiday', 'day off', 'days off', 'away', 'block out time', 'unavailable', 'leave', 'sick day', 'out of office', 'pto'],
  extraHours: ['extra availability', 'additional hours', 'overtime', 'open extra times', 'weekend hours'],
  activity: ['reviews', 'review', 'updates', 'notifications', 'inbox', 'feed', 'unread', 'check-ins', 'check ins', 'logs', 'workouts logged'],
  invitations: ['invites', 'invite', 'invitation', 'pending clients', 'not invited', 'not accepted', 'resend invite', 'send invite', 'onboarding', 'sign up'],
  serviceRequests: ['service request', 'add a service', 'new service', 'change service', 'upgrade', 'enrol', 'enroll'],
  templates: ['template', 'program templates', 'reusable programs', 'presets'],
  billing: ['payments', 'invoices', 'charges', 'fees', 'balance', 'owed', 'money', 'paid', 'unpaid'],
  profile: ['account', 'my profile', 'personal details', 'name', 'photo', 'picture', 'avatar', 'phone number', 'date of birth', 'preferences', 'settings'],
  timeZone: ['timezone', 'tz', 'region', 'local time', 'clock', 'change my time zone'],
  availability: ['working hours', 'business hours', 'open hours', 'weekly hours', 'bookable times', 'when clients can book', 'booking notice', 'buffer', 'schedule'],
  sessionSettings: ['meeting link', 'video link', 'zoom', 'google meet', 'call link', 'late cancellation', 'cancellation window'],
  paymentSettings: ['e-transfer', 'etransfer', 'interac', 'e-transfer email', 'payment email'],
} as const satisfies Record<string, readonly string[]>;

export type Concept = keyof typeof SYNONYMS;
