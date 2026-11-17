import { useState } from 'react';

const HIDE_CANCELLED_KEY = 'mps.meetings.hideCancelled';

/**
 * "Hide cancelled meetings", shared by the client page's list and the Meetings calendar. A per-browser
 * preference; storage can be unavailable, so it falls back to showing everything.
 */
export function useHideCancelled(): [boolean, (value: boolean) => void] {
  const [hide, setHide] = useState(() => {
    try { return localStorage.getItem(HIDE_CANCELLED_KEY) === '1'; } catch { return false; }
  });
  return [hide, (value) => {
    setHide(value);
    try { localStorage.setItem(HIDE_CANCELLED_KEY, value ? '1' : '0'); } catch { /* the toggle still works for this visit */ }
  }];
}

export const isCancelled = (meeting: { status: string }) => meeting.status === 'cancelled' || meeting.status === 'late_cancelled';
