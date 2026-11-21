import { Card } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/Skeleton';

/** A meeting card's shape (avatar, who, when, what), shared by the coach's next meeting and the client's upcoming one. */
export function MeetingCardSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <Card as="div" padding="sm">
      <div className="flex items-start gap-3">
        <Skeleton shape="round" className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <SkeletonText size="base" width="w-32" />
          <SkeletonText width="w-48" />
          <SkeletonText size="xs" width="w-40" className="mt-0.5" />
        </div>
      </div>
      {actions ? (
        <div className="mt-3 flex gap-2">
          {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className={`h-11 ${i ? 'w-28' : 'w-32'}`} />)}
        </div>
      ) : null}
    </Card>
  );
}

/** Upcoming meeting rows: gold bar, day and time, then client and topic. `dayColumn` is off for today's rows, which show only a time. */
export function MeetingRowsSkeleton({ count, dayColumn = true }: { count: number; dayColumn?: boolean }) {
  return (
    <ul>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex min-h-11 items-center gap-3 py-2 pl-2 pr-2">
          <span className="w-1 shrink-0 self-stretch rounded-full bg-line" />
          {dayColumn ? (
            <span className="w-24 shrink-0">
              <SkeletonText width="w-16" />
              <SkeletonText width="w-12" />
            </span>
          ) : <SkeletonText width="w-12" className="w-16 shrink-0" />}
          <span className="min-w-0 flex-1">
            <SkeletonText width={i % 2 ? 'w-24' : 'w-28'} />
            <SkeletonText size="xs" width={i % 2 ? 'w-32' : 'w-36'} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** MeetingRow's shape: bar, day, then time range and details. */
export function MeetingListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="divide-y divide-line">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex min-h-14 items-center gap-3 py-2 pl-2 pr-2">
          <span className="w-1 shrink-0 self-stretch rounded-full bg-line" />
          <SkeletonText width={i % 2 ? 'w-16' : 'w-20'} className="w-28 shrink-0" />
          <span className="min-w-0 flex-1">
            <SkeletonText width="w-32" />
            <SkeletonText size="xs" width={i % 2 ? 'w-40' : 'w-52'} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The meeting dialog's body while the meeting loads, about its usual height so the dialog doesn't jump. */
export function MeetingDialogSkeleton({ label = 'Loading meeting' }: { label?: string }) {
  return (
    <LoadingRegion label={label} className="grid gap-4">
      <div>
        <SkeletonText size="lg" width="w-48" />
        <SkeletonText width="w-56" />
        <SkeletonText size="xs" width="w-40" className="mt-0.5" />
      </div>
      <Skeleton className="h-10" />
      <SkeletonText lines={2} />
      <div className="flex gap-2">
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-28" />
      </div>
    </LoadingRegion>
  );
}
