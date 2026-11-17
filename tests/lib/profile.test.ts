import { describe, expect, it } from 'vitest';
import { localDate, PHOTO_MAX_BYTES, profileSchema, schedulingSchema, validatePhoto } from '@/features/profile/validation';
import { timeZoneOptions } from '@/lib/timeZones';

describe('profile settings', () => {
  it('trims names and phones and allows optional personal details to be cleared', () => {
    expect(profileSchema.parse({ displayName: ' Maya ', dateOfBirth: '', phoneNumber: ' ' })).toEqual({ displayName: 'Maya', dateOfBirth: '', phoneNumber: '' });
    expect(profileSchema.parse({ displayName: '', dateOfBirth: '2000-02-29', phoneNumber: '+1 (416) 555-0123' }).phoneNumber).toBe('+1 (416) 555-0123');
  });
  it('rejects invalid and future birthdays and oversized names or invalid phones', () => {
    for (const patch of [{ dateOfBirth: '2025-02-29' }, { dateOfBirth: '2999-01-01' }, { dateOfBirth: '1899-12-31' }, { displayName: 'a'.repeat(121) }, { phoneNumber: 'not a phone' }, { phoneNumber: '123' }]) {
      expect(profileSchema.safeParse({ displayName: 'Maya', dateOfBirth: '', phoneNumber: '', ...patch }).success).toBe(false);
    }
  });
  it('uses the local calendar date rather than UTC for the birthday limit', () => {
    expect(localDate(new Date(2026, 10, 17, 23, 59))).toBe('2026-11-17');
  });
  it('accepts supported photos and rejects empty, oversized, SVG and unknown uploads', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) expect(() => validatePhoto({ type, size: PHOTO_MAX_BYTES })).not.toThrow();
    for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: '', size: 100 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 }]) expect(() => validatePhoto(file)).toThrow();
  });
  it('accepts https meeting links or none, and whole late-cancel hours from 0 to 168', () => {
    expect(schedulingSchema.parse({ meetingUrl: ' https://meet.google.com/wdk-jmwy-nok ', lateCancelHours: '24' })).toEqual({ meetingUrl: 'https://meet.google.com/wdk-jmwy-nok', lateCancelHours: 24 });
    expect(schedulingSchema.parse({ meetingUrl: '', lateCancelHours: '0' })).toEqual({ meetingUrl: '', lateCancelHours: 0 });
    for (const patch of [{ meetingUrl: 'http://meet.google.com/abc' }, { meetingUrl: 'meet.google.com/abc' }, { meetingUrl: 'https://localhost/abc' }, { lateCancelHours: '' }, { lateCancelHours: '1.5' }, { lateCancelHours: '169' }, { lateCancelHours: '-1' }]) {
      expect(schedulingSchema.safeParse({ meetingUrl: '', lateCancelHours: '24', ...patch }).success).toBe(false);
    }
  });
  it('always offers UTC, the database default zone', () => {
    expect(timeZoneOptions().some((option) => option.value === 'UTC')).toBe(true);
  });
});
