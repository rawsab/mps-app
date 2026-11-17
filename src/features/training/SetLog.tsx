import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui';
import type { Exercise, ProgramDraft } from '@/domain/programs/contract';
import { dayMuscleChanges, formatChange, type LoggedSet, type TrainingSession } from '@/domain/training/volume';
import { logErrorMessage, useDeleteSet, useSaveSet, useUpdateSession, type SetInput } from './api';

/**
 * Mesocycle set logging (FR-07, decision 0021): weight and reps per set, up to the coach's maximum
 * set count. Each row saves on blur with a browser-generated id, so a retry updates the same row.
 * Entries that fail to save stay on screen with the error and a retry.
 */

type Unit = '' | 'lb' | 'kg' | 'BW';
type Row = { id: string; setNumber: number; weight: string; unit: Unit; reps: string; state: 'saved' | 'saving' | 'error' | 'new' | 'dirty'; message?: string; byStaff: boolean };

const unitOf = (set: LoggedSet): Unit => (set.loadMode === 'bodyweight' ? 'BW' : set.loadUnit ?? '');
const toRow = (set: LoggedSet): Row => ({
  id: set.id, setNumber: set.setNumber, weight: set.loadValue === null ? '' : String(set.loadValue), unit: unitOf(set),
  reps: set.reps === null ? '' : String(set.reps), state: 'saved', byStaff: set.updatedByStaff,
});
const NUMBER = /^\d+(?:\.\d+)?$/;

/** Prescribed unit, else the unit of the last set the client logged for anything this session. */
function defaultUnit(exercise: Exercise, session: TrainingSession, rows: Row[]): Unit {
  const last = rows.at(-1)?.unit;
  if (last) return last;
  const load = exercise.prescription.targets[0]?.load;
  if (load?.mode === 'bodyweight') return 'BW';
  if ((load?.mode === 'external' || load?.mode === 'assisted') && load.unit) return load.unit;
  const recent = [...session.sets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find((set) => unitOf(set));
  return recent ? unitOf(recent) : '';
}

/** Validates a row into the server call; returns a message instead when it can't be saved yet. */
function toInput(row: Row, session: TrainingSession, exercise: Exercise): SetInput | string {
  const weight = row.weight.trim();
  const reps = row.reps.trim();
  if (weight && !NUMBER.test(weight)) return 'Weight must be a number, e.g. 85 or 82.5';
  if (reps && !NUMBER.test(reps)) return 'Reps must be a number, e.g. 10 or 8.5';
  if (weight && row.unit === '') return 'Choose lb or kg for this weight';
  const base = { id: row.id, sessionId: session.id, exerciseId: exercise.id, setNumber: row.setNumber, reps: reps ? Number(reps) : null };
  if (row.unit === 'BW') return { ...base, loadMode: 'bodyweight', loadValue: null, loadUnit: null };
  if (!weight) return { ...base, loadMode: null, loadValue: null, loadUnit: null };
  return { ...base, loadMode: 'external', loadValue: Number(weight), loadUnit: row.unit as 'lb' | 'kg' };
}

export function ExerciseSetLog({ programId, session, exercise, readOnly }: { programId: string; session: TrainingSession; exercise: Exercise; readOnly: boolean }) {
  const saveSet = useSaveSet(programId);
  const deleteSet = useDeleteSet(programId);
  const max = Math.ceil(exercise.prescription.setCount?.max ?? 0);
  const serverSets = session.sets.filter((set) => set.exerciseId === exercise.id).sort((a, b) => a.setNumber - b.setNumber);
  const [rows, setRows] = useState<Row[]>(() => serverSets.map(toRow));
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Take in rows saved elsewhere (another device, a coach correction) unless they're being edited here.
  const signature = serverSets.map((set) => `${set.id}:${set.updatedAt}`).join('|');
  useEffect(() => {
    setRows((current) => {
      const local = new Map(current.map((row) => [row.id, row]));
      const merged = serverSets.map((set) => {
        const row = local.get(set.id);
        return row && row.state !== 'saved' ? row : toRow(set);
      });
      const unsaved = current.filter((row) => row.state !== 'saved' && !serverSets.some((set) => set.id === row.id));
      return [...merged, ...unsaved].sort((a, b) => a.setNumber - b.setNumber);
    });
    // serverSets is derived from signature.
  }, [signature]);

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const save = (row: Row) => {
    const input = toInput(row, session, exercise);
    if (typeof input === 'string') { update(row.id, { state: 'error', message: input }); return; }
    update(row.id, { state: 'saving', message: undefined });
    saveSet.mutate(input, {
      onSuccess: () => update(row.id, { state: 'saved', message: undefined, byStaff: false }),
      onError: (err) => update(row.id, { state: 'error', message: logErrorMessage(err) }),
    });
  };

  const add = () => {
    const row: Row = { id: crypto.randomUUID(), setNumber: rows.length + 1, weight: rows.at(-1)?.weight ?? '', unit: defaultUnit(exercise, session, rows), reps: '', state: 'new', byStaff: false };
    setRows((current) => [...current, row]);
    // Save the empty row now so the set number is reserved; weight carries over from the last set.
    save(row);
  };

  const remove = (row: Row) => {
    setRemoveError(null);
    if (row.state === 'new' || (row.state === 'error' && !serverSets.some((set) => set.id === row.id))) {
      setRows((current) => current.filter((r) => r.id !== row.id));
      return;
    }
    deleteSet.mutate({ id: row.id, sessionId: session.id }, {
      onSuccess: () => setRows((current) => current.filter((r) => r.id !== row.id)),
      onError: (err) => setRemoveError(logErrorMessage(err)),
    });
  };

  if (max === 0) return <p className="mt-2 text-xs text-muted">Your coach hasn’t set a number of sets for this exercise.</p>;

  return (
    <div className="mt-3 border-t border-line pt-3">
      {rows.length ? (
        <ol className="grid gap-2">
          {rows.map((row, index) => (
            <SetRow key={row.id} row={row} exerciseName={exercise.name} readOnly={readOnly} canRemove={index === rows.length - 1}
              onChange={(patch) => update(row.id, { ...patch, state: 'dirty', message: undefined })}
              onCommit={(next) => save(next)} onRemove={() => remove(row)} />
          ))}
        </ol>
      ) : null}
      {removeError ? <p role="alert" className="mt-2 text-xs text-danger">{removeError}</p> : null}
      {!readOnly ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button variant="secondary" className="min-h-10 px-3" disabled={rows.length >= max} onClick={add}>+ Add set</Button>
          <span className="text-xs text-muted">{rows.length} of {max} {max === 1 ? 'set' : 'sets'}</span>
        </div>
      ) : null}
    </div>
  );
}

function SetRow({ row, exerciseName, readOnly, canRemove, onChange, onCommit, onRemove }: {
  row: Row; exerciseName: string; readOnly: boolean; canRemove: boolean;
  onChange: (patch: Partial<Row>) => void; onCommit: (row: Row) => void; onRemove: () => void;
}) {
  const id = useId();
  const label = `${exerciseName}, set ${row.setNumber}`;
  const field = 'min-h-11 w-full min-w-0 rounded-card border border-line bg-ink px-2 text-base text-text focus:border-gold focus:outline-none sm:text-sm disabled:opacity-60';
  // Commit with the latest typed values; blur fires before React re-renders the parent.
  const commit = (patch: Partial<Row> = {}) => onCommit({ ...row, ...patch });
  return (
    <li>
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.75rem_minmax(0,1fr)_2.75rem] items-center gap-1.5">
        <span className="text-sm tabular-nums text-muted">Set {row.setNumber}</span>
        <input aria-label={`${label} weight`} inputMode="decimal" placeholder={row.unit === 'BW' ? 'BW' : 'Weight'} value={row.unit === 'BW' ? '' : row.weight}
          disabled={readOnly || row.unit === 'BW'} className={field}
          onChange={(e) => onChange({ weight: e.target.value })} onBlur={(e) => commit({ weight: e.target.value })} />
        <select aria-label={`${label} unit`} value={row.unit} disabled={readOnly} className={`${field} px-1`}
          onChange={(e) => { const unit = e.target.value as Unit; onChange({ unit }); commit({ unit }); }}>
          <option value="">Unit</option>
          <option value="lb">lb</option>
          <option value="kg">kg</option>
          <option value="BW">BW</option>
        </select>
        <input aria-label={`${label} reps`} inputMode="decimal" placeholder="Reps" value={row.reps} disabled={readOnly} className={field}
          aria-describedby={row.message ? `${id}-message` : undefined}
          onChange={(e) => onChange({ reps: e.target.value })} onBlur={(e) => commit({ reps: e.target.value })} />
        {!readOnly && canRemove ? (
          <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}
            className="inline-flex size-11 items-center justify-center rounded-card text-muted hover:bg-surface-raised hover:text-danger">
            <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        ) : <span />}
      </div>
      <p id={`${id}-message`} aria-live="polite" className={`ml-11 min-h-4 text-xs ${row.state === 'error' && row.message ? 'text-danger' : 'text-muted'}`}>
        {row.state === 'saving' ? 'Saving…' : row.state === 'error' ? <>{row.message ?? 'Not saved yet'}{row.message ? <> · <button type="button" className="underline" onClick={() => commit()}>Retry</button></> : null}</> : row.byStaff ? 'Edited by your coach' : ''}
      </p>
    </li>
  );
}

/** Sets per muscle and overall for the day, with the change since each muscle was last trained. */
export function SetTotals({ program, sessions, dayId }: { program: ProgramDraft; sessions: TrainingSession[]; dayId: string }) {
  const result = dayMuscleChanges(program, sessions, dayId);
  if (!result || result.volume.planned === 0) return null;
  const { volume, muscles } = result;
  return (
    <section aria-labelledby={`totals-${dayId}`} className="mb-6 rounded-card border border-line p-3">
      <h3 id={`totals-${dayId}`} className="mb-1 font-semibold">Set totals</h3>
      <p className="mb-3 text-xs text-muted">Logged sets (with reps) out of planned. Change compares with the last day that trained the muscle.</p>
      {muscles.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th scope="col" className="py-1 font-medium">Muscle</th><th scope="col" className="py-1 text-right font-medium">Sets</th><th scope="col" className="py-1 text-right font-medium">Change</th></tr></thead>
          <tbody className="divide-y divide-line">
            {muscles.map((m) => (
              <tr key={m.key}>
                <th scope="row" className="py-2 text-left font-normal">{m.name}</th>
                <td className="py-2 text-right tabular-nums">{m.logged} <span className="text-muted">/ {m.planned}</span></td>
                <td className="py-2 text-right tabular-nums" title={m.comparedTo ? `Compared with ${m.comparedTo.label}${m.comparedTo.logged ? '' : ' (not logged)'}` : 'First day this muscle is trained'}>
                  <span className={m.change && m.change > 0 ? 'text-success' : m.change && m.change < 0 ? 'text-danger' : 'text-muted'}>{formatChange(m.change)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-line font-medium"><th scope="row" className="pt-2 text-left">Total sets</th><td className="pt-2 text-right tabular-nums">{volume.logged} <span className="font-normal text-muted">/ {volume.planned}</span></td><td /></tr></tfoot>
        </table>
      ) : (
        <p className="text-sm">Total sets: <span className="tabular-nums">{volume.logged} / {volume.planned}</span>. <span className="text-muted">Muscle totals appear once your coach adds muscle groups.</span></p>
      )}
    </section>
  );
}

/** Workout date, completion and notes. */
export function SessionDetails({ programId, session, readOnly }: { programId: string; session: TrainingSession; readOnly: boolean }) {
  const updateSession = useUpdateSession(programId);
  const [notes, setNotes] = useState(session.notes);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setNotes(session.notes), [session.notes]);
  const save = (patch: Partial<{ status: TrainingSession['status']; performedOn: string | null; notes: string }>) => {
    setError(null);
    updateSession.mutate({ sessionId: session.id, status: session.status, performedOn: session.performedOn, notes, ...patch }, { onError: (err) => setError(logErrorMessage(err)) });
  };
  const completed = session.status === 'completed';
  return (
    <section aria-label="Workout details" className="mb-6 grid gap-3 rounded-card bg-surface-raised p-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Workout date</span>
          <input type="date" value={session.performedOn ?? ''} disabled={readOnly} onChange={(e) => save({ performedOn: e.target.value || null })}
            className="min-h-11 rounded-card border border-line bg-ink px-2 text-base text-text sm:text-sm" />
        </label>
        {!readOnly ? (
          <Button variant={completed ? 'secondary' : 'primary'} busy={updateSession.isPending} onClick={() => save({ status: completed ? 'in_progress' : 'completed' })}>
            {completed ? 'Reopen workout' : 'Mark workout complete'}
          </Button>
        ) : null}
      </div>
      {completed && session.completedAt ? <p className="text-xs text-muted">Completed {new Date(session.completedAt).toLocaleString()}</p> : null}
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Notes</span>
        <textarea rows={2} value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} onBlur={() => { if (notes !== session.notes) save({ notes }); }}
          placeholder="How did it go?" className="min-h-16 rounded-card border border-line bg-ink px-2 py-2 text-base text-text sm:text-sm" />
      </label>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </section>
  );
}
