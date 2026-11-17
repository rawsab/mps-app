import { useId, useState, type FormEvent } from 'react';
import { Dialog } from '@/components/Dialog';
import { Alert, Button } from '@/components/ui';
import { dayHeading, weekName } from '@/domain/programs/labels';
import { planAddGridStructure, type GridRow, type GridStructureRequest } from '@/domain/programs/grid';
import { useEditor } from './useDraftEditor';

const inputClass = 'min-h-11 w-full rounded-card border border-line bg-ink px-3 text-base text-text focus:border-gold focus:outline-none sm:text-sm';

/** Build workout structure without leaving Grid; the first exercise makes the new item visible. */
export function AddGridStructureDialog({ currentRow, initialWeekId, initialKind = 'day', onAdded, onClose }: {
  currentRow: GridRow | undefined;
  initialWeekId?: string | null;
  initialKind?: GridStructureRequest['kind'];
  onAdded: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const editor = useEditor();
  const id = useId();
  const [kind, setKind] = useState<GridStructureRequest['kind']>(initialKind);
  const [weekId, setWeekId] = useState(currentRow?.weekId ?? initialWeekId ?? editor.draft.weeks.at(-1)?.id ?? '');
  const defaultWeek = editor.draft.weeks.find((week) => week.id === initialWeekId);
  const newDayOption = defaultWeek && !defaultWeek.days.length ? `new:${defaultWeek.id}` : null;
  const [dayId, setDayId] = useState(currentRow?.dayId ?? defaultWeek?.days.at(-1)?.id ?? newDayOption ?? '');
  const defaultLabel = kind === 'week' ? weekName(editor.draft.weeks.length) : '';
  const [label, setLabel] = useState<string | null>(null);
  const name = label ?? defaultLabel;
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const request: GridStructureRequest = kind === 'week' ? { kind, label: weekName(editor.draft.weeks.length) }
      : kind === 'day' ? { kind, label: name.trim(), weekId: weekId || null }
      : { kind, label: name.trim() || 'New section', dayId: dayId.startsWith('new:') ? null : dayId || null, sectionKind: dayId === '' ? 'preparation' : 'main', ...(dayId.startsWith('new:') ? { weekId: dayId.slice(4) } : {}) };
    const plan = planAddGridStructure(editor.draft, request);
    const problem = editor.dispatch(plan.commands);
    if (problem) { setError(problem.message); return; }
    onAdded(plan.exerciseId);
    onClose();
  };
  return <Dialog title="Add to grid" onClose={onClose} footer={<>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    <Button type="submit" form={id}>Add {kind}</Button>
  </>}>
    <form id={id} onSubmit={submit} className="grid gap-4 p-4 sm:p-5">
      <label className="grid gap-1 text-sm font-medium text-text">
        Add
        <select autoFocus value={kind} onChange={(e) => { setKind(e.target.value as GridStructureRequest['kind']); setLabel(null); setError(null); }} className={inputClass}>
          <option value="day">Day</option><option value="week">Week</option><option value="section">Section</option>
        </select>
      </label>
      {kind === 'day' ? <label className="grid gap-1 text-sm font-medium text-text">
        Week
        <select value={weekId} onChange={(e) => setWeekId(e.target.value)} className={inputClass}>
          {editor.draft.weeks.length === 0 ? <option value="">New week</option> : null}
          {editor.draft.weeks.map((w, index) => <option key={w.id} value={w.id}>{weekName(index)}</option>)}
        </select>
      </label> : null}
      {kind === 'section' ? <>
        <label className="grid gap-1 text-sm font-medium text-text">
          Day
          <select value={dayId} onChange={(e) => setDayId(e.target.value)} className={inputClass}>
            <option value="">All days (shared)</option>
            {newDayOption && defaultWeek ? <option value={newDayOption}>{weekName(editor.draft.weeks.indexOf(defaultWeek))} / Day 1 (new)</option> : null}
            {editor.draft.weeks.map((w, index) => <optgroup key={w.id} label={weekName(index)}>
              {w.days.map((d, index) => <option key={d.id} value={d.id}>{dayHeading(d, index)}</option>)}
            </optgroup>)}
          </select>
        </label>
      </> : null}
      {kind !== 'week' ? <label className="grid gap-1 text-sm font-medium text-text">
        {kind === 'section' ? 'Section name (optional)' : 'Focus (optional)'}
        <input value={name} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'day' ? 'Legs, Pull, Push…' : undefined} maxLength={120} className={inputClass} />
      </label> : <p className="text-sm text-muted">Creates {weekName(editor.draft.weeks.length)}. Weeks and days are numbered automatically.</p>}
      {error ? <Alert>{error}</Alert> : null}
    </form>
  </Dialog>;
}
