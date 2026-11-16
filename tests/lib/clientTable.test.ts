import { describe, expect, it } from 'vitest';
import type { ClientRow } from '@/features/clients/api';
import { DEFAULT_TABLE_STATE, filterAndSortClients, paramsFromState, stateFromParams } from '@/features/clients/clientTable';

const row = (name: string, status: ClientRow['status'], services: [ClientRow['service_enrollments'][number]['service'], 'active' | 'paused' | 'ended'][], created: string): ClientRow => ({
  id: name,
  email: `${name.toLowerCase().replace(/\s/g, '.')}@example.test`,
  full_name: name,
  status,
  timezone: 'UTC',
  auth_user_id: status === 'pending' ? null : 'u',
  created_at: created,
  service_enrollments: services.map(([service, s], i) => ({ id: `${name}${i}`, service, status: s, starts_on: '2026-01-01', ends_on: s === 'ended' ? '2026-02-01' : null })),
});

const rows = [
  row('Avery Stone', 'active', [['mesocycle', 'active'], ['nutrition', 'paused']], '2026-03-01'),
  row('Blake Rivers', 'pending', [['nutrition', 'active']], '2026-01-15'),
  row('Casey Moore', 'disabled', [['personal_training', 'ended']], '2026-02-10'),
  row('Drew Park', 'invited', [['personal_training', 'active']], '2026-04-20'),
];
const names = (r: ClientRow[]) => r.map((x) => x.full_name);

describe('client table', () => {
  it('searches name and email, case-insensitively', () => {
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, query: 'RIVERS' }))).toEqual(['Blake Rivers']);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, query: 'drew.park@' }))).toEqual(['Drew Park']);
  });

  it('filters by any of the selected statuses', () => {
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, statuses: ['disabled'] }))).toEqual(['Casey Moore']);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, statuses: ['pending', 'invited'] }))).toEqual(['Blake Rivers', 'Drew Park']);
  });

  it('keeps clients who have every selected live service (paused counts, ended does not)', () => {
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, services: ['nutrition'] }))).toEqual(['Avery Stone', 'Blake Rivers']);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, services: ['mesocycle', 'nutrition'] }))).toEqual(['Avery Stone']);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, services: ['personal_training'] }))).toEqual(['Drew Park']);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, services: ['personal_training', 'nutrition'] }))).toEqual([]);
  });

  it('combines status and service filters', () => {
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, statuses: ['active', 'pending'], services: ['nutrition'] }))).toEqual([
      'Avery Stone',
      'Blake Rivers',
    ]);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, statuses: ['pending'], services: ['mesocycle'] }))).toEqual([]);
  });

  it('sorts by status order and by date in either direction', () => {
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, sort: 'status' }))).toEqual(['Avery Stone', 'Drew Park', 'Blake Rivers', 'Casey Moore']);
    expect(names(filterAndSortClients(rows, { ...DEFAULT_TABLE_STATE, sort: 'added', dir: 'desc' }))).toEqual(['Drew Park', 'Avery Stone', 'Casey Moore', 'Blake Rivers']);
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
