import type { WorkoutDay } from './contract';

/** Numbers follow current order, never the stored/imported heading text. */
export const weekName = (index: number) => `Week ${index + 1}`;
export const dayName = (index: number) => `Day ${index + 1}`;

/** Keep the existing storage key for compatibility; expose its descriptive part as Focus. */
export function dayFocus(day: Pick<WorkoutDay, 'label'>): string {
  return day.label
    .replace(/^\s*W\d+(?:\s*[·:|/–—-]\s*|\s+)(?=\S)/i, '')
    .replace(/^\s*Day\s*\d+\b\s*(?:[·:|/–—-]\s*)?/i, '')
    .trim();
}

export function dayHeading(day: Pick<WorkoutDay, 'label'>, index: number): string {
  const focus = dayFocus(day);
  return `${dayName(index)}${focus ? ` · ${focus}` : ''}`;
}
