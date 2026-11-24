import { dayHeading, weekTitle } from '@/domain/programs/labels';
import type { ProgramDraft } from '@/domain/programs/contract';

export function programDestinations(draft: ProgramDraft) {
  return [
    { id: 'details', label: 'Program details' },
    { id: 'shared', label: 'Every-workout preparation' },
    ...draft.weeks.flatMap((week, w) => [
      { id: week.id, label: weekTitle(draft, week, w) },
      ...week.days.map((day, d) => ({ id: day.id, label: `${weekTitle(draft, week, w)} / ${dayHeading(day, d)}` })),
    ]),
    { id: 'resources', label: 'Resources' },
  ];
}

export function selectedProgramItem(draft: ProgramDraft, requested: string | null) {
  if (requested && programDestinations(draft).some((item) => item.id === requested)) return requested;
  return draft.weeks[0]?.days[0]?.id ?? draft.weeks[0]?.id ?? 'details';
}

/** Publish paths use zero-based document indexes, resolved against the current draft. */
export function publishDestination(draft: ProgramDraft, path: string, target: 'sets' | 'effort' = 'sets'): { item: string; field?: string } {
  const parts = path.split('.');
  if (parts[0] === 'programTheme') return { item: 'details', field: 'program:programTheme' };
  if (parts[0] === 'title') return { item: 'details', field: 'program:title' };
  if (parts[0] === 'sharedSections') {
    const section = draft.sharedSections[Number(parts[1])];
    const exercise = section?.exercises[Number(parts[3])];
    if (section) return { item: 'shared', field: exercise ? `${exercise.id}:${parts.at(-1) === 'name' ? 'name' : target}` : `${section.id}:title` };
  }
  if (parts[0] === 'weeks') {
    const week = draft.weeks[Number(parts[1])];
    const day = week?.days[Number(parts[3])];
    const section = day?.sections[Number(parts[5])];
    const exercise = section?.exercises[Number(parts[7])];
    if (day) return { item: day.id, field: exercise ? `${exercise.id}:${parts.at(-1) === 'name' ? 'name' : target}` : section ? `${section.id}:title` : `${day.id}:label` };
    if (week) return { item: week.id, field: `${week.id}:startDate` };
  }
  return { item: 'details' };
}

export function rejectedDestination(draft: ProgramDraft, key: string): { item: string; field: string } {
  const id = key.split(':')[0];
  const hasId = (section: ProgramDraft['sharedSections'][number]) => section.id === id || section.exercises.some((exercise) => exercise.id === id);
  let item = 'details';
  if (draft.sharedSections.some(hasId)) item = 'shared';
  else if (draft.resources.some((resource) => resource.id === id)) item = 'resources';
  else {
    for (const week of draft.weeks) {
      if (week.id === id) item = week.id;
      const day = week.days.find((day) => day.id === id || day.sections.some(hasId));
      if (day) item = day.id;
    }
  }
  return { item, field: key };
}
