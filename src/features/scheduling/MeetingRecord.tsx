import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRightIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { Alert, Button, SelectField, Spinner, TextAreaField, TextField } from '@/components/ui';
import { formatBytes, RESOURCE_ACCEPT, resourceFileProblem, resourceKind, titleFromFileName } from '@/domain/scheduling/resources';
import {
  openResourceUrl, schedulingError, useAddMeetingFile, useAddMeetingLink, useCorrectAttendance, useRecordAttendance, useRemoveMeetingResource,
  useSaveSharedNotes, type Attendance, type Meeting, type MeetingResource,
} from './api';
import { sessionMoment } from './time';

// Attendance, shared notes and resources for one meeting (decision 0047).

const ATTENDANCE_LABEL: Record<Attendance | 'scheduled', string> = { completed: 'Attended', no_show: 'No-show', scheduled: 'Not recorded' };

/**
 * Once a meeting has started, a dropdown records Attended or No-show straight away. Changing a
 * recorded status is a correction, with an optional reason kept in the audit. Cancelled meetings
 * have nothing to record.
 */
export function AttendanceSection({ meeting, onSaved }: { meeting: Meeting; onSaved: (message: string) => void }) {
  const record = useRecordAttendance();
  const correct = useCorrectAttendance();
  const recorded = meeting.status === 'completed' || meeting.status === 'no_show' ? meeting.status : null;
  // The correction being made, if any.
  const [to, setTo] = useState<Attendance | 'scheduled' | null>(null);
  const [reason, setReason] = useState('');
  const pending = meeting.request?.status === 'pending';
  const busy = record.isPending || correct.isPending;
  const error = record.error ?? correct.error;

  if (new Date(meeting.startsAt).getTime() > Date.now()) return null;
  if (meeting.status !== 'scheduled' && !recorded) return null;

  function choose(value: Attendance | 'scheduled') {
    if (recorded) {
      setTo(value === recorded ? null : value);
      return;
    }
    if (value === 'scheduled') return;
    record.mutate({ id: meeting.id, status: value }, { onSuccess: () => onSaved(value === 'completed' ? 'Recorded as attended.' : 'Recorded as a no-show.') });
  }

  return (
    <section aria-labelledby="meeting-attendance" className="grid gap-3 border-t border-line pt-4">
      <h3 id="meeting-attendance" className="text-base font-semibold">Attendance</h3>
      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="Status" className="w-full sm:w-56" disabled={busy || (!recorded && pending)}
          value={to ?? record.variables?.status ?? recorded ?? 'scheduled'} onChange={(event) => choose(event.target.value as Attendance | 'scheduled')}>
          {(['scheduled', 'completed', 'no_show'] as const).map((status) => <option key={status} value={status}>{ATTENDANCE_LABEL[status]}</option>)}
        </SelectField>
        {record.isPending ? <span className="pb-3"><Spinner small label="Saving" /></span> : null}
      </div>
      {!recorded && pending ? <p className="text-sm text-muted">Answer the client’s request before recording attendance.</p> : null}

      {recorded && to ? (
        <div className="grid gap-3 rounded-card border border-line p-3">
          <TextAreaField label={`Reason for changing to ${ATTENDANCE_LABEL[to].toLowerCase()} (optional)`} rows={2} maxLength={1000} value={reason}
            onChange={(event) => setReason(event.target.value)} hint="Kept with the change. The client doesn’t see it." />
          <div className="flex flex-wrap gap-2">
            <Button busy={correct.isPending} disabled={busy}
              onClick={() => correct.mutate({ id: meeting.id, status: to, reason }, { onSuccess: () => onSaved(`Attendance changed to ${ATTENDANCE_LABEL[to].toLowerCase()}.`) })}>
              Save correction
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setTo(null); setReason(''); }}>Keep {ATTENDANCE_LABEL[recorded].toLowerCase()}</Button>
          </div>
        </div>
      ) : null}

      {meeting.attendanceChanges.length > 1 ? (
        <ul className="grid gap-1 text-xs text-muted">
          {meeting.attendanceChanges.map((change, index) => (
            <li key={index}>
              {ATTENDANCE_LABEL[change.toStatus as Attendance | 'scheduled'] ?? change.toStatus} · {sessionMoment(change.changedAt, meeting.timezone)}
              {change.changedByName ? ` · ${change.changedByName}` : ''}{change.reason ? ` · “${change.reason}”` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <Alert visible={!!error} title="Not saved">{schedulingError(error)}</Alert>
    </section>
  );
}

export function SharedNotesField({ meeting, onSaved }: { meeting: Meeting; onSaved: (message: string) => void }) {
  const save = useSaveSharedNotes();
  const [notes, setNotes] = useState(meeting.sharedNotes ?? '');
  return (
    <div className="grid gap-2">
      <TextAreaField label="Shared with client" rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)}
        hint="The client sees these with the meeting." />
      <div>
        <Button variant="secondary" busy={save.isPending} disabled={save.isPending || notes.trim() === (meeting.sharedNotes ?? '')}
          onClick={() => save.mutate({ id: meeting.id, notes }, { onSuccess: () => onSaved(notes.trim() ? 'Shared notes saved.' : 'Shared notes removed.') })}>
          Save shared notes
        </Button>
      </div>
      <Alert visible={!!save.error} title="Not saved">{schedulingError(save.error)}</Alert>
    </div>
  );
}

/** A signed link to a stored file, refreshed before it expires. */
function useResourceHref(resource: MeetingResource) {
  return useQuery({
    queryKey: ['meeting-resource-url', resource.storagePath],
    enabled: resource.kind === 'file' && !!resource.storagePath,
    staleTime: 50 * 60_000,
    refetchInterval: 50 * 60_000,
    queryFn: () => openResourceUrl(resource.storagePath!),
  });
}

function ResourceRow({ resource, onRemove, removing }: { resource: MeetingResource; onRemove?: () => void; removing?: boolean }) {
  const signed = useResourceHref(resource);
  const href = resource.kind === 'link' ? resource.url : signed.data;
  const [confirming, setConfirming] = useState(false);
  const kind = resourceKind(resource);
  return (
    <li className="flex min-h-12 items-center gap-3 py-1.5">
      <span className="w-12 shrink-0 text-xs text-muted">{kind}</span>
      <span className="min-w-0 flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm text-gold-fg">
            <span className="link truncate">{resource.title}</span><ArrowUpRightIcon />
          </a>
        ) : <span className="block truncate text-sm">{resource.title}</span>}
        {resource.kind === 'file' && resource.sizeBytes ? <span className="block text-xs text-muted">{formatBytes(resource.sizeBytes)}</span> : null}
      </span>
      {onRemove ? (
        confirming ? (
          <span className="flex shrink-0 gap-1">
            <Button variant="danger" className="px-3" busy={removing} onClick={onRemove}>Remove</Button>
            <Button variant="ghost" className="px-3" disabled={removing} onClick={() => setConfirming(false)}>Keep</Button>
          </span>
        ) : (
          <Button variant="ghost" className="px-2" aria-label={`Remove ${resource.title}`} title="Remove" onClick={() => setConfirming(true)}><TrashIcon /></Button>
        )
      ) : null}
    </li>
  );
}

/** Read-only list, for the client's views. */
export function ResourceList({ resources }: { resources: MeetingResource[] }) {
  if (!resources.length) return null;
  return <ul className="divide-y divide-line">{resources.map((resource) => <ResourceRow key={resource.id} resource={resource} />)}</ul>;
}

/** Files and links, always shared with the client. Changes stay in the dialog and report inline. */
export function ResourcesSection({ meeting }: { meeting: Meeting }) {
  const addFile = useAddMeetingFile();
  const addLink = useAddMeetingLink();
  const remove = useRemoveMeetingResource();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [adding, setAdding] = useState<'file' | 'link' | null>(null);
  const [url, setUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const busy = addFile.isPending || addLink.isPending || remove.isPending;
  const error = addFile.error ?? addLink.error ?? remove.error;
  // Mutations refetch the meeting, so the list below is always the server's.
  const resources = meeting.resources;

  function chooseFile(chosen: File | null) {
    setNotice('');
    if (!chosen) return;
    const reason = resourceFileProblem(chosen);
    setProblem(reason ?? '');
    if (reason) return;
    setFile(chosen);
    setFileTitle(titleFromFileName(chosen.name));
  }

  function reset() {
    setAdding(null); setFile(null); setFileTitle(''); setUrl(''); setLinkTitle(''); setProblem('');
    if (fileInput.current) fileInput.current.value = '';
  }

  function upload() {
    if (!file) return setProblem('Choose a file.');
    if (!fileTitle.trim()) return setProblem('Give the file a title.');
    addFile.mutate({ meeting, file, title: fileTitle }, { onSuccess: () => { reset(); setNotice('File added. The client can open it now.'); } });
  }

  function saveLink() {
    if (!/^https:\/\/\S+$/.test(url.trim())) return setProblem('Links start with https://');
    addLink.mutate({ id: meeting.id, url: url.trim(), title: linkTitle }, { onSuccess: () => { reset(); setNotice('Link added.'); } });
  }

  return (
    <section aria-labelledby="meeting-resources" className="grid gap-3 border-t border-line pt-4">
      <div>
        <h3 id="meeting-resources" className="text-base font-semibold">Resources</h3>
        <p className="text-xs text-muted">Always shared with the client. Images, videos and PDFs up to 50 MB, or links for longer videos.</p>
      </div>
      {resources.length ? (
        <ul className="divide-y divide-line">
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} removing={remove.isPending && remove.variables === resource.id}
              onRemove={() => remove.mutate(resource.id, {
                onSuccess: (result) => setNotice(result.fileLeft ? `Removed ${resource.title}, but its file could not be deleted from storage.` : `Removed ${resource.title}.`),
              })} />
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No resources yet.</p>}

      {adding === 'file' ? (
        <div className="grid gap-3 rounded-card border border-line p-3">
          <input ref={fileInput} type="file" accept={RESOURCE_ACCEPT} aria-label="File" disabled={busy}
            className="text-sm file:mr-3 file:min-h-11 file:rounded-card file:border file:border-line file:bg-surface-raised file:px-4 file:text-sm file:text-text"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          {file ? <TextField label="Title" maxLength={200} value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} hint={formatBytes(file.size)} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button busy={addFile.isPending} disabled={busy || !file} onClick={upload}>Upload</Button>
            <Button variant="ghost" disabled={addFile.isPending} onClick={reset}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {adding === 'link' ? (
        <div className="grid gap-3 rounded-card border border-line p-3">
          <TextField label="Link" type="url" inputMode="url" placeholder="https://" maxLength={2000} value={url} onChange={(event) => setUrl(event.target.value)} />
          <TextField label="Title (optional)" maxLength={200} value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button busy={addLink.isPending} disabled={busy || !url.trim()} onClick={saveLink}>Add link</Button>
            <Button variant="ghost" disabled={addLink.isPending} onClick={reset}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {!adding ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => { setNotice(''); setAdding('file'); }}><PlusIcon />Upload file</Button>
          <Button variant="secondary" disabled={busy} onClick={() => { setNotice(''); setAdding('link'); }}><PlusIcon />Add link</Button>
        </div>
      ) : null}

      <Alert visible={!!notice} tone="success" onDismiss={() => setNotice('')}>{notice}</Alert>
      <Alert visible={!!problem}>{problem}</Alert>
      <Alert visible={!!error} title="Not saved">{schedulingError(error)}</Alert>
    </section>
  );
}
