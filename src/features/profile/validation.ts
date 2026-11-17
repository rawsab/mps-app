import { z } from 'zod';

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export const profileSchema = z.object({
  displayName: z.string().trim().max(120, 'Use 120 characters or fewer.'),
  dateOfBirth: z.union([z.literal(''), z.iso.date('Enter a valid date.')]).refine((value) => !value || (value >= '1900-01-01' && value <= localDate()), 'Enter a date between January 1, 1900 and today.'),
  phoneNumber: z.string().trim().max(40, 'Use 40 characters or fewer.').refine((value) => !value || (/^\+?[0-9() .-]+$/.test(value) && value.replace(/\D/g, '').length >= 5), 'Enter a valid phone number, including the country code if needed.'),
});

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export function validatePhoto(file: Pick<File, 'size' | 'type'>) {
  if (!PHOTO_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (!file.size || file.size > PHOTO_MAX_BYTES) throw new Error('Choose an image smaller than 5 MB.');
}
