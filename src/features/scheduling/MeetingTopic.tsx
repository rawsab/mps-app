import { programCandidates } from '@/domain/programs/current';
import type { ProgramRow } from '@/features/programs/api';
import { programTitle } from '@/features/programs/ProgramsCard';
import { ToggleButton } from '@/components/controls';
import { SelectField } from '@/components/ui';
import { SERVICE_SHORT_LABELS } from '@/lib/services';
import type { MeetingContext, MeetingTopic } from './api';

type Service = MeetingTopic['services'][number];

/** A sensible first choice: Personal training when it's active, else the first active service. */
export function defaultTopic(context: MeetingContext): MeetingTopic {
  const active = context.services.filter((s) => s.status === 'active').map((s) => s.service);
  return { services: active.includes('personal_training') ? ['personal_training'] : active.slice(0, 1), programs: {} };
}

/** "Personal training · Mesocycle" */
export const topicLabel = (services: Service[]) => services.map((s) => SERVICE_SHORT_LABELS[s]).join(' · ');

/**
 * What a meeting is about: one or more of the client's live services and, per service, the program
 * to discuss. "Current program" (no choice) follows whatever is current for the service.
 */
export function MeetingTopicFields({ context, programs, value, onChange }: {
  context: MeetingContext; programs: ProgramRow[]; value: MeetingTopic; onChange: (topic: MeetingTopic) => void;
}) {
  function toggle(service: Service) {
    const on = value.services.includes(service);
    const services = on ? value.services.filter((s) => s !== service) : [...value.services, service];
    const { [service]: _dropped, ...rest } = value.programs;
    onChange({ services, programs: on ? rest : value.programs });
  }

  return (
    <div className="grid gap-4">
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">About</legend>
        <div className="flex flex-wrap gap-1.5">
          {context.services.map(({ service, status }) => {
            const on = value.services.includes(service);
            return (
              <ToggleButton key={service} pressed={on} className="px-3" onClick={() => toggle(service)}>
                {SERVICE_SHORT_LABELS[service]}{status === 'paused' ? ' (paused)' : ''}
              </ToggleButton>
            );
          })}
        </div>
        {value.services.includes('personal_training') ? null : <p className="mt-2 text-xs text-muted">Only Personal training meetings are billed.</p>}
      </fieldset>
      {value.services.map((service) => {
        const enrollment = context.services.find((s) => s.service === service);
        const candidates = enrollment ? programCandidates(enrollment.enrollmentId, programs) : [];
        if (!candidates.length) return null;
        const current = candidates.find((p) => p.id === enrollment?.currentProgramId);
        return (
          <SelectField key={service} label={`${SERVICE_SHORT_LABELS[service]} program`} value={value.programs[service] ?? ''}
            onChange={(event) => {
              const { [service]: _dropped, ...rest } = value.programs;
              onChange({ ...value, programs: event.target.value ? { ...rest, [service]: event.target.value } : rest });
            }}>
            <option value="">{current ? `Current program · ${programTitle(current)}` : 'Current program (none chosen yet)'}</option>
            {candidates.filter((p) => p.id !== current?.id).map((p) => <option key={p.id} value={p.id}>{programTitle(p)}</option>)}
          </SelectField>
        );
      })}
    </div>
  );
}
