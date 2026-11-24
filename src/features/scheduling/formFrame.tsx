import type { ReactNode } from 'react';
import { Dialog } from '@/components/Dialog';

/**
 * How a create form is shown: in its own dialog on the client's page, or inside the calendar's
 * New meeting dialog, which adds a client picker above it (decision 0066).
 */
export type FormFrame = (parts: { title: string; description: string; body: ReactNode; footer: ReactNode; busy: boolean }) => ReactNode;

export const dialogFrame = (onClose: () => void): FormFrame => function DialogFrame({ title, description, body, footer, busy }) {
  return <Dialog wide title={title} description={description} onClose={() => { if (!busy) onClose(); }} footer={footer}>{body}</Dialog>;
};

/** The start and length a create form currently holds, so switching between forms keeps them. */
export type MeetingStart = { startsAt: Date; durationMinutes: number };
