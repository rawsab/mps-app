import { describe, expect, it } from 'vitest';
import type { ClientRow } from '@/features/clients/api';
import {
  clampColumnWidth, clientOverview, DEFAULT_COLUMN_WIDTHS, DEFAULT_TABLE_STATE, filterAndSortClients, lastEditedAt, MIN_COLUMN_WIDTHS, paramsFromState, parseColumnWidths, stateFromParams,
} from '@/features/clients/clientTable';

const row = (name: string, status: ClientRow['status'], services: [ClientRow['service_enrollments'][number]['service'], 'active' | 'paused' | 'ended'][], created: string): ClientRow => ({
  id: name,
  email: `${name.toLowerCase().replace(/\s/g, '.')}@example.test`,
  full_name: name,
  status,
  timezone: 'UTC',
  auth_user_id: status === 'pending' ? null : 'u',
  created_at: created,
  updated_at: created,
  service_enrollments: services.map(([service, s], i) => ({ id: `${name}${i}`, service, status: s, starts_on: '2026-01-01', ends_on: s === 'ended' ? '2026-02-01' : null, archived_at: null, current_program_id: null, current_nutrition_program_id: null })),
});

const rows = [
  row('Avery Stone', 'active', [['mesocycle', 'active'], ['nutrition', 'paused']], '2026-03-01'),
  row('Blake Rivers', 'pending', [['nutrition', 'active']], '2026-01-15'),
  row('Casey Moore', 'disabled', [['personal_training', 'ended']], '2026-02-10'),
  row('Drew Park', 'invited', [['personal_training', 'active']], '2026-04-20'),
];
const names = (r: ClientRow[]) => r.map((x) => x.full_name);
// Filter and sort assertions below read in name order; the table's own default is newest edit first.
const BY_NAME = { ...DEFAULT_TABLE_STATE, sort: 'name', dir: 'asc' } as const;

describe('client table', () => {
  it('defaults to the most recently edited client first', () => {
    expect([DEFAULT_TABLE_STATE.sort, DEFAULT_TABLE_STATE.dir]).toEqual(['edited', 'desc']);
  });

  it('orders same-day edits by time and counts service changes as edits', () => {
    const morning = { ...row('Morning', 'active', [['mesocycle', 'active']], '2026-11-16T09:00:00Z') };
    const evening = { ...row('Evening', 'active', [], '2026-11-16T18:00:00Z') };
    morning.service_enrollments = [{ ...morning.service_enrollments[0]!, updated_at: '2026-11-16T20:30:00Z' }];
    expect(lastEditedAt(morning)).toBe('2026-11-16T20:30:00Z');
    expect(names(filterAndSortClients([evening, morning], { ...BY_NAME, sort: 'edited', dir: 'desc' }))).toEqual(['Morning', 'Evening']);
  });

  it('searches name and email, case-insensitively', () => {
    expect(names(filterAndSortClients(rows, { ...BY_NAME, query: 'RIVERS' }))).toEqual(['Blake Rivers']);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, query: 'drew.park@' }))).toEqual(['Drew Park']);
  });

  it('filters by any of the selected statuses', () => {
    expect(names(filterAndSortClients(rows, { ...BY_NAME, statuses: ['disabled'] }))).toEqual(['Casey Moore']);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, statuses: ['pending', 'invited'] }))).toEqual(['Blake Rivers', 'Drew Park']);
  });

  it('keeps clients who have every selected live service (paused counts, ended does not)', () => {
    expect(names(filterAndSortClients(rows, { ...BY_NAME, services: ['nutrition'] }))).toEqual(['Avery Stone', 'Blake Rivers']);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, services: ['mesocycle', 'nutrition'] }))).toEqual(['Avery Stone']);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, services: ['personal_training'] }))).toEqual(['Drew Park']);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, services: ['personal_training', 'nutrition'] }))).toEqual([]);
  });

  it('combines status and service filters', () => {
    expect(names(filterAndSortClients(rows, { ...BY_NAME, statuses: ['active', 'pending'], services: ['nutrition'] }))).toEqual([
      'Avery Stone',
      'Blake Rivers',
    ]);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, statuses: ['pending'], services: ['mesocycle'] }))).toEqual([]);
  });

  it('sorts by status order and by date in either direction', () => {
    expect(names(filterAndSortClients(rows, { ...BY_NAME, sort: 'status' }))).toEqual(['Avery Stone', 'Drew Park', 'Blake Rivers', 'Casey Moore']);
    expect(names(filterAndSortClients(rows, { ...BY_NAME, sort: 'added', dir: 'desc' }))).toEqual(['Drew Park', 'Avery Stone', 'Casey Moore', 'Blake Rivers']);
  });

  it('round-trips multi-select state through the URL and ignores invalid values', () => {
    const state = { query: 'av', statuses: ['active', 'invited'], services: ['mesocycle', 'nutrition'], sort: 'added', dir: 'desc' } as const;
    const params = paramsFromState({ ...state, statuses: [...state.statuses], services: [...state.services] });
    expect(params.get('status')).toBe('active,invited');
    expect(stateFromParams(params)).toEqual(state);
    expect(paramsFromState(DEFAULT_TABLE_STATE).toString()).toBe('');
    expect(stateFromParams(new URLSearchParams('status=hacked,active&service=;drop&sort=x'))).toEqual({ ...DEFAULT_TABLE_STATE, statuses: ['active'] });
  });
});

describe('client overview', () => {
  it('counts live services and statuses, and lists follow-ups by name', () => {
    const extra = row('Aaron Bell', 'pending', [], '2026-05-01');
    const o = clientOverview([...rows, extra]);
    expect(o.total).toBe(5);
    expect(o.services).toEqual({ personal_training: 1, mesocycle: 1, nutrition: 2 });
    expect(o.statuses).toEqual({ active: 1, invited: 1, pending: 2, disabled: 1 });
    expect(names(o.notInvited)).toEqual(['Aaron Bell', 'Blake Rivers']);
    expect(names(o.inviteUnaccepted)).toEqual(['Drew Park']);
  });
});

describe('client table column widths', () => {
  it('clamps to each column minimum and a shared maximum', () => {
    expect(clampColumnWidth('name', 10)).toBe(MIN_COLUMN_WIDTHS.name);
    expect(clampColumnWidth('email', 5000)).toBe(640);
    expect(clampColumnWidth('services', 240.6)).toBe(241);
  });

  it('reads stored widths and falls back to defaults for missing or bad values', () => {
    expect(parseColumnWidths(null)).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths('not json')).toEqual(DEFAULT_COLUMN_WIDTHS);
    expect(parseColumnWidths('{"name": 300, "email": "wide", "status": 1, "x": 9}'))
      .toEqual({ ...DEFAULT_COLUMN_WIDTHS, name: 300, status: MIN_COLUMN_WIDTHS.status });
  });
});
