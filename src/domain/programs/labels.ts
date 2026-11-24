import type { ProgramDraft, ProgramWeek, WorkoutDay } from './contract';

/** Numbers follow current order, never the stored/imported heading text. */
export const weekName = (index: number) => `Week ${index + 1}`;
export const dayName = (index: number) => `Day ${index + 1}`;

/** A coach's own week name. Blank and default "Week N" labels don't count, so their number follows the order. */
export function customWeekName(label: string): string | null {
  const name = label.trim();
  return name && !/^week\s*\d+$/i.test(name) ? name : null;
}

/**
 * Personal training weeks can be renamed (owner request, 2026-11-24). Mesocycle weeks stay numbered:
 * their stored labels are imported headings, which must not replace the order-based number.
 */
export function weekTitle(program: Pick<ProgramDraft, 'service'>, week: Pick<ProgramWeek, 'label'>, index: number): string {
  return (program.service === 'personal_training' ? customWeekName(week.label) : null) ?? weekName(index);
}

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
