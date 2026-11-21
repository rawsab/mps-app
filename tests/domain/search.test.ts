import { describe, expect, it } from 'vitest';
import { COACH_DESTINATIONS } from '@/domain/search/destinations';
import { editDistance, fold, matchEntry, queryTokens } from '@/domain/search/match';
import { clientEntries, programEntries, search, type SearchAccess } from '@/domain/search/search';
import { SYNONYMS } from '@/domain/search/synonyms';

const coach: SearchAccess = { admin: false, scheduling: true };

const clients = clientEntries([
  { id: 'c1', full_name: 'Grace Liu', email: 'grace.liu@example.test', status: 'active' },
  { id: 'c2', full_name: 'Graham Ortiz', email: 'gortiz@example.test', status: 'invited' },
  { id: 'c3', full_name: 'Zoë Brandt', email: 'zoe@example.test', status: 'active' },
]);
const programs = programEntries([
  { id: 'p1', clientId: 'c1', clientName: 'Grace Liu', service: 'mesocycle', title: 'Hypertrophy Block A' },
  { id: 'p2', clientId: 'c1', clientName: 'Grace Liu', service: 'nutrition', title: 'Lean bulk macros' },
  { id: 'p3', clientId: 'c3', clientName: 'Zoë Brandt', service: 'personal_training', title: 'Strength foundations' },
]);
const entries = [...COACH_DESTINATIONS, ...clients, ...programs];

const titles = (query: string, access = coach) => search(entries, query, access).flatMap((g) => g.results.map((r) => r.title));
const top = (query: string) => titles(query)[0];

describe('matching', () => {
  it('folds case and accents without moving characters', () => {
    expect(fold('Zoë Brandt')).toBe('zoe brandt');
    expect(fold('Zoë').length).toBe(3);
  });

  it('drops filler words unless nothing else is left', () => {
    expect(queryTokens('How do I change my time zone?')).toEqual(['change', 'time', 'zone']);
    expect(queryTokens('the')).toEqual(['the']);
  });

  it('counts an adjacent swap as one edit', () => {
    expect(editDistance('calednar', 'calendar', 2)).toBe(1);
    expect(editDistance('abc', 'xyz123', 1)).toBe(2);
  });

  it('ranks exact, then word prefix, then mid-word, then typo', () => {
    const score = (q: string) => matchEntry(q, 'Reschedule requests')?.score ?? 0;
    expect(score('reschedule requests')).toBeGreaterThan(score('resch'));
    expect(score('resch')).toBeGreaterThan(score('schedule'));
    expect(score('schedule')).toBeGreaterThan(score('reschedual'));
    expect(score('reschedual')).toBeGreaterThan(0);
  });

  it('needs every meaningful word to match', () => {
    expect(matchEntry('time zone', 'Time zone')).not.toBeNull();
    expect(matchEntry('time banana', 'Time zone')).toBeNull();
  });

  it('highlights only the matched part of the title', () => {
    expect(matchEntry('gra', 'Grace Liu')?.ranges).toEqual([[0, 3]]);
    expect(matchEntry('liu gra', 'Grace Liu')?.ranges).toEqual([[0, 3], [6, 9]]);
    // A synonym match highlights nothing.
    expect(matchEntry('invites', 'Client invitations', ['invites'])?.ranges).toEqual([]);
  });

  it('does not match search terms mid-word', () => {
    expect(matchEntry('gra', 'Templates', ['program templates'])).toBeNull();
  });
});

describe('search', () => {
  it('finds clients by partial name, active ones first', () => {
    const groups = search(entries, 'Gra', coach);
    expect(groups[0]?.group).toBe('clients');
    expect(groups[0]?.results.map((r) => r.title)).toEqual(['Grace Liu', 'Graham Ortiz']);
    expect(groups[0]?.results[0]).toMatchObject({ icon: 'user', to: '/coach/clients/c1' });
  });

  it('finds clients by accentless name and email', () => {
    expect(top('zoe')).toBe('Zoë Brandt');
    expect(top('gortiz')).toBe('Graham Ortiz');
    // The shared domain matches nobody.
    expect(titles('example')).toEqual([]);
  });

  it('puts the named page first', () => {
    expect(top('Calendar')).toBe('Calendar');
    expect(search(entries, 'calendar', coach)[0]?.results[0]).toMatchObject({ icon: 'calendar', to: '/coach/meetings#meeting-calendar' });
    expect(top('meetings')).toBe('Meetings');
    expect(top('templates')).toBe('Templates');
  });

  it('tolerates typos', () => {
    expect(top('calender')).toBe('Calendar');
    expect(top('availabilty')).toBe('Availability');
    expect(top('timezone')).toBe('Time zone');
  });

  it('finds sections by synonyms and natural phrasing', () => {
    expect(top('invites')).toBe('Client invitations');
    expect(top('pending clients')).toBe('Client invitations');
    expect(top('vacation')).toBe('Time off');
    expect(top('block out time')).toBe('Time off');
    expect(top('change my time zone')).toBe('Time zone');
    expect(top('working hours')).toBe('Availability');
    expect(top('reschedule')).toBe('Reschedule requests');
    expect(top('notifications')).toBe('Activity');
    expect(top('zoom link')).toBe('Session settings');
  });

  it('suggests pages and sections before anything is typed, never clients or programs', () => {
    const groups = search(entries, '  ', coach);
    expect(groups.map((g) => g.group)).toEqual(['pages', 'meetings', 'clientsPage', 'settings']);
    expect(groups.flatMap((g) => g.results).every((r) => r.suggested)).toBe(true);
  });

  it('finds programs by name and links to the right editor', () => {
    expect(search(entries, 'hypertrophy', coach)[0]?.results[0]).toMatchObject({
      group: 'programs', icon: 'mesocycle', to: '/coach/clients/c1/programs/p1', detail: 'Grace Liu · Mesocycle',
    });
    expect(search(entries, 'lean bulk', coach)[0]?.results[0]).toMatchObject({ icon: 'nutrition', to: '/coach/clients/c1/nutrition/p2' });
    expect(search(entries, 'strenght', coach)[0]?.results[0]).toMatchObject({ icon: 'personalTraining', to: '/coach/clients/c3/programs/p3' });
  });

  it('lists programs of a kind by its service name, but not by client name', () => {
    expect(search(entries, 'mesocycle', coach).find((g) => g.group === 'programs')?.results.map((r) => r.title)).toEqual(['Hypertrophy Block A']);
    expect(search(entries, 'grace', coach).some((g) => g.group === 'programs')).toBe(false);
  });

  it('leaves out destinations the viewer cannot reach', () => {
    const noScheduling = { admin: false, scheduling: false };
    expect(titles('vacation', noScheduling)).not.toContain('Time off');
    expect(titles('availability', noScheduling)).not.toContain('Availability');
    expect(titles('time zone', noScheduling)).toContain('Time zone');
  });

  it('caps each group', () => {
    const many = clientEntries(Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, full_name: `Sam ${i}`, email: `sam${i}@example.test`, status: 'active' as const })));
    expect(search(many, 'sam', coach)[0]?.results).toHaveLength(6);
  });
});

describe('registry', () => {
  it('has unique ids and coach paths', () => {
    const ids = COACH_DESTINATIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of COACH_DESTINATIONS) expect(d.to).toMatch(/^\/coach\/[a-z/-]+(#[a-z-]+)?$/);
  });

  it('finds every destination by its own title', () => {
    for (const d of COACH_DESTINATIONS) expect(top(d.title), d.title).toBe(d.title);
  });

  it('keeps synonyms lower case and unique per concept', () => {
    for (const [concept, words] of Object.entries(SYNONYMS)) {
      expect(new Set(words).size, concept).toBe(words.length);
      for (const word of words) expect(word, concept).toBe(word.toLowerCase());
    }
  });
});
