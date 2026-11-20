import { z } from 'zod';

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const profileSchema = z.object({
  displayName: z.string().trim().max(120, 'Use 120 characters or fewer.'),
  dateOfBirth: z.union([z.literal(''), z.iso.date('Enter a valid date.')]).refine((value) => !value || (value >= '1900-01-01' && value <= localDate()), 'Enter a date between January 1, 1900 and today.'),
  phoneNumber: z.string().trim().max(40, 'Use 40 characters or fewer.').refine((value) => !value || (/^\+?[0-9() .-]+$/.test(value) && value.replace(/\D/g, '').length >= 5), 'Enter a valid phone number, including the country code if needed.'),
});

// Same rule as the profiles.meeting_url check: https with a dotted host.
const MEETING_URL = /^https:\/\/[^\s/?#]+\.\S*$/;
export const schedulingSchema = z.object({
  meetingUrl: z.string().trim().max(500, 'Use 500 characters or fewer.').refine((value) => !value || MEETING_URL.test(value), 'Enter a full https:// link, for example https://meet.google.com/abc-defg-hij.'),
  // A blank field is an error, never 0 hours.
  lateCancelHours: z.string().trim().regex(/^\d{1,3}$/, 'Enter whole hours from 0 to 168.').transform(Number).refine((hours) => hours <= 168, 'Enter whole hours from 0 to 168.'),
});

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function validatePhoto(file: Pick<File, 'size' | 'type'>) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (!file.size || file.size > PHOTO_MAX_BYTES) throw new Error('Choose an image smaller than 5 MB.');
}

// Same bounds as the profiles booking_* checks (migration 00049). A blank field is an error, never 0.
const wholeNumber = (min: number, max: number, message: string) =>
  z.string().trim().regex(/^\d{1,3}$/, message).transform(Number).refine((n) => n >= min && n <= max, message);
export const bookingRulesSchema = z.object({
  bookingNoticeHours: wholeNumber(0, 168, 'Enter whole hours from 0 to 168.'),
  bookingHorizonDays: wholeNumber(1, 90, 'Enter whole days from 1 to 90.'),
  bookingBufferMinutes: wholeNumber(0, 120, 'Enter whole minutes from 0 to 120.'),
});
