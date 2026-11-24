import { CautionIcon } from '@/components/icons';
import { CONFLICT_DEMO_MEETINGS, DEMO_NOW, DEMO_TIME_ZONE } from '@/domain/help/meetingDemos';
import { meetingConflicts } from '@/domain/scheduling/conflicts';
import { ConflictCard } from '@/features/scheduling/ConflictCard';

/** The Meetings page's Conflicts section with fictional meetings, drawn by the page's own card. */
export function ConflictsExample() {
  const conflicts = meetingConflicts(CONFLICT_DEMO_MEETINGS, DEMO_NOW.getTime());
  return (
    <section className="w-full max-w-sm rounded-card border border-line bg-surface p-4 shadow-popover">
      <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <span className="text-danger"><CautionIcon /></span>Conflicts
        <span className="text-danger">{conflicts.length} {conflicts.length === 1 ? 'overlap' : 'overlaps'}</span>
      </p>
      {conflicts.map((conflict) => (
        <ConflictCard key={conflict.startsAt} conflict={conflict} timeZone={DEMO_TIME_ZONE} showCoach={false} meetingHref={() => '#'} />
      ))}
    </section>
  );
}
