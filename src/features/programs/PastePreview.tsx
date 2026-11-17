import { useId } from 'react';
import { Dialog } from '@/components/Dialog';
import { Alert, Button } from '@/components/ui';
import { columnLabel, GRID_COLUMNS, type GridColumn, type GridPlan, type GridRow } from '@/domain/programs/grid';

export function PastePreview({ columns = GRID_COLUMNS, text, onTextChange, plan, rows, onClose, onApply }: {
  columns?: readonly GridColumn[];
  text: string;
  onTextChange: (text: string) => void;
  plan: GridPlan | null;
  rows: GridRow[];
  onClose: () => void;
  onApply: () => void;
}) {
  const id = useId();
  const byId = new Map(rows.map((row) => [row.exerciseId, row]));
  const location = (exerciseId: string | null) => {
    const row = exerciseId ? byId.get(exerciseId) : null;
    return row ? `${row.dayLabel} · ${row.exercise.name}` : 'Grid';
  };
  const valid = plan !== null && plan.errors.length === 0;
  return <Dialog wide title="Preview paste" description="Review the changes before applying them together. Nothing from this paste is saved until you apply."
    onClose={onClose} footer={<>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button disabled={!valid || plan.changes.length === 0} onClick={onApply}>Apply {plan?.changes.length ?? 0} changes</Button>
    </>}>
    <div className="grid gap-4 p-4 sm:p-5">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-text">Pasted cells (tabs separate columns; new lines separate rows)</label>
        <textarea id={id} value={text} onChange={(e) => onTextChange(e.target.value)} rows={4} spellCheck={false}
          className="mt-1 w-full rounded-card border border-line bg-ink p-3 font-mono text-sm focus:border-gold focus:outline-none" />
      </div>
      {!plan ? <Alert title="Paste destination is no longer available">Cancel and select a cell again.</Alert> : plan.errors.length > 0 ? (
        <Alert title="Paste needs correction">
          <p>No cells will change. Correct the pasted text above, or cancel and choose another destination.</p>
          <ul className="mt-2 list-disc pl-4">{plan.errors.map((error, i) => <li key={i}>
            {location(error.exerciseId)}{error.column ? ` · ${columnLabel(error.column, columns)}` : ''}: {error.message}
          </li>)}</ul>
        </Alert>
      ) : plan.changes.length === 0 ? <p className="text-sm text-muted">This paste makes no changes.</p> : (
        <div>
          <p className="mb-3 text-sm text-muted">{plan.changes.length} cell changes across {new Set(plan.changes.map((change) => change.exerciseId)).size} exercises</p>
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Proposed cell changes</caption>
            <thead><tr className="border-b border-line text-muted">
              <th scope="col" className="w-2/5 py-2 pr-3 font-medium">Exercise / field</th>
              <th scope="col" className="py-2 pr-3 font-medium">Before</th>
              <th scope="col" className="py-2 font-medium">After</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {plan.changes.map((change) => <tr key={`${change.exerciseId}:${change.column}`} className="align-top">
                <th scope="row" className="break-words py-3 pr-3 font-medium">{location(change.exerciseId)}<span className="mt-1 block font-normal text-muted">{columnLabel(change.column, columns)}</span></th>
                <td className="whitespace-pre-wrap break-words py-3 pr-3 text-muted">{change.before || '(blank)'}</td>
                <td className="whitespace-pre-wrap break-words py-3">{change.after || '(blank)'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </Dialog>;
}
