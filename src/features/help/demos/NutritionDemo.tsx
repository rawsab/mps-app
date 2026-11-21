import { useMemo } from 'react';
import { Badge, Button } from '@/components/ui';
import { NUTRITION_DEMOS, NUTRITION_DEMO_PROGRAM, CLIENT_LOG_SAVE_TARGET, HISTORY_TARGET, nutritionCellTarget, type NutritionDemoName, type NutritionDemoState } from '@/domain/help/nutritionDemos';
import { NUTRITION_GRID_COLUMNS, nutritionGridCoachEdited, nutritionGridLabels, nutritionGridMissing, nutritionGridText } from '@/domain/nutritionGrid';
import { nutritionWeeks } from '@/domain/nutritionProgram';
import type { NutritionEntry } from '@/domain/nutrition';
import { nutritionNumber } from '@/features/nutrition/NutritionSpreadsheet';
import { formatDate } from '@/lib/format';
import { DemoPlayer } from './DemoPlayer';

/** A nutrition demo by name, for Help pages: `<NutritionDemo name="nutrition-week" />`. */
export function NutritionDemo({ name }: { name: NutritionDemoName }) {
  const script = NUTRITION_DEMOS[name];
  // The demo's tallest moment, Correction history open, sizes the frame for every frame.
  const tallest = script.frames.find((frame) => frame.state.history)?.state;
  // What Correction history lists once opened; it stays drawn while closed so it can unfold.
  const history = tallest?.history ?? null;
  return <DemoPlayer script={script} render={(state) => (
    <div className="grid">
      {/* The real picture comes first, so the pointer finds its cells rather than the sizer's. */}
      <div className="self-center [grid-area:1/1]"><NutritionDemoSheet state={state} history={history} /></div>
      {/* Hidden by opacity, not visibility: the opened history inside sets its own visibility back on. */}
      {tallest ? <div aria-hidden className="pointer-events-none opacity-0 [grid-area:1/1]"><NutritionDemoSheet state={tallest} history={history} /></div> : null}
    </div>
  )} />;
}

/** As Correction history describes a calorie entry. */
const describe = (entry: NutritionEntry) => `Intake: ${entry.intake ?? '—'} kcal; output: ${entry.output ?? '—'} kcal`;

/**
 * One week of the coach's nutrition spreadsheet drawn from a demo frame: the real column labels, cell
 * text, rounding, missing and coach-edited states, worked out by `nutritionWeeks`. The client's log
 * floats over it.
 */
function NutritionDemoSheet({ state, history }: { state: NutritionDemoState; history: NutritionDemoState['history'] }) {
  const week = useMemo(() => nutritionWeeks(NUTRITION_DEMO_PROGRAM, state.weights, state.entries, state.today)[0]!, [state.weights, state.entries, state.today]);
  const labels = nutritionGridLabels(week.unit);
  const changed = new Set((state.changed ?? []).map(nutritionCellTarget));

  return (
    <div className="relative flex w-[44rem] flex-col text-left text-sm text-text">
      <div className="relative overflow-hidden rounded-card border border-line bg-surface shadow-popover">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
          <span className="font-semibold">Week 1</span>
          <span className="text-xs text-muted">{formatDate(week.from)} to {formatDate(week.through)}</span>
        </div>
        <table className="w-full table-fixed border-separate border-spacing-0">
          <colgroup><col className="w-28" /><col className="w-24" /><col className="w-32" /><col className="w-32" /><col className="w-28" /><col className="w-28" /></colgroup>
          <thead className="bg-surface-raised">
            <tr>{labels.map((label) => <th key={label} className="border-b border-r border-line px-3 py-2 text-left align-bottom text-xs font-medium leading-4 text-muted last:border-r-0">{label}</th>)}</tr>
          </thead>
          <tbody>
            {week.rows.map((row) => (
              <tr key={row.date}>
                {NUTRITION_GRID_COLUMNS.map((column, c) => {
                  const point = { exerciseId: row.date, column: c };
                  const cell = { date: row.date, column };
                  const value = nutritionGridText(week, point);
                  const editing = state.editing?.date === row.date && state.editing.column === column ? state.editing : null;
                  const selected = state.selection?.date === row.date && state.selection.column === column;
                  const missing = state.showMissing && !editing && nutritionGridMissing(point, state.today, value);
                  const coachEdited = nutritionGridCoachEdited(week, point);
                  const future = row.date > state.today && c >= 1 && c <= 3;
                  const tip = state.tip?.date === row.date && state.tip.column === column;
                  return (
                    <td key={column} data-demo-target={nutritionCellTarget(cell)}
                      className={`relative h-10 border-b border-r border-line px-3 tabular-nums last:border-r-0 [tr:last-child>&]:border-b-0 ${c === 0 ? 'text-left text-xs' : 'text-right'}
                        ${selected || missing ? 'bg-gold/10' : coachEdited ? 'bg-gold/5' : ''} ${future || c >= 4 ? 'text-muted' : ''}
                        ${selected || editing ? 'outline-2 -outline-offset-2 outline-gold' : ''} ${editing ? 'bg-ink' : ''} ${changed.has(nutritionCellTarget(cell)) ? 'help-demo-changed' : ''}`}>
                      {editing ? <>{editing.text}<span className="help-demo-caret ml-px inline-block h-4 w-px translate-y-0.5 bg-text" /></>
                        : c === 0 ? formatDate(row.date)
                        : missing ? <span className="text-xs font-medium text-gold-fg">Missing</span>
                        : value === '' ? '\u00a0' : c >= 4 ? nutritionNumber(Number(value), c === 4 ? 0 : 1) : value}
                      {/* The cell's hover note, as the spreadsheet's tooltip gives it. */}
                      {tip ? <span className={`help-demo-tip absolute left-2 top-full z-[2] mt-1 whitespace-nowrap rounded-[5px] bg-text px-2 py-1 text-left text-xs text-ink shadow-popover ${state.tip?.shown ? 'opacity-100' : '-translate-y-1 opacity-0'}`}>Calories for {formatDate(row.activityDate)}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Dims the spreadsheet behind the client's log, as a dialog's backdrop does. */}
        <span className={`pointer-events-none absolute inset-0 bg-ink/60 transition-opacity duration-200 ${state.clientLog ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      {history ? (
        <div className="mt-3 rounded-card border border-line bg-surface px-4 py-2 shadow-popover">
          <span data-demo-target={HISTORY_TARGET} className="flex min-h-9 items-center gap-2 font-medium">
            <span aria-hidden className={`text-muted transition-transform duration-300 ${state.history ? 'rotate-90' : ''}`}>›</span> Correction history
          </span>
          {/* Unfolds, so the content above eases up as it grows (the frame is centred). */}
          <div data-open={!!state.history} className="animated-disclosure-content help-demo-unfold">
            <div className="min-h-0 overflow-hidden">
              {history.map((change) => (
                <div key={change.activityDate} className="border-t border-line py-3">
                  <span className="flex items-center gap-2"><span className="font-medium">{formatDate(change.activityDate)} · Calorie activity</span><Badge tone="gold">Coach correction</Badge></span>
                  <span className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-card border border-line p-3">
                    <span className="text-muted">Before</span><span>{describe(change.before)}</span>
                    <span className="text-muted">After</span><span>{describe(change.after)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {state.clientLog ? (
        <div className="absolute left-1/2 top-1/2 z-[1] w-72 -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-4 shadow-popover">
          <p className="text-xs font-medium text-muted">In the client’s app</p>
          <p className="mt-0.5 font-semibold">Today’s log</p>
          {([['Today’s weight', state.clientLog.weight, 'lb'], ['Calories consumed yesterday', state.clientLog.intake, 'kcal'], ['Caloric output yesterday', state.clientLog.output, 'kcal']] as const).map(([label, text, unit]) => (
            <span key={label} className="mt-3 block">
              <span className="block text-xs font-medium">{label}</span>
              <span className="mt-1 flex min-h-10 items-center justify-between rounded-card border border-line bg-ink px-3 tabular-nums">{text || '\u00a0'}<span className="text-xs text-muted">{unit}</span></span>
            </span>
          ))}
          <span data-demo-target={CLIENT_LOG_SAVE_TARGET} className="mt-4 block"><Button className="w-full">Save</Button></span>
        </div>
      ) : null}
    </div>
  );
}
