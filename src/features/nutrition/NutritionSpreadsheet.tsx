import { useId, useRef, type ReactNode } from 'react';
import { Dialog } from '@/components/Dialog';
import { SpreadsheetViewport } from '@/components/SpreadsheetViewport';
import { CopyIcon, TrashIcon, StimulusIcon, ProgressIcon } from '@/components/icons';
import { Alert, Button } from '@/components/ui';
import { nutritionTotals, nutritionWeeks, type NutritionProgramDraft, type NutritionProgramSnapshot, type NutritionWeek } from '@/domain/nutritionProgram';
import { NUTRITION_GRID_COLUMNS, nutritionGridLabels, nutritionGridCoachEdited, nutritionGridEditable, nutritionGridText } from '@/domain/nutritionGrid';
import { GridPopupMenu } from '@/features/programs/GridPopupMenu';
import { formatDate, formatDateTime } from '@/lib/format';
import { NutritionTrendChart } from './NutritionTrendChart';
import { useNutritionGrid } from './useNutritionGrid';
export function nutritionNumber(value: number | null, digits = 1): string {
  return value === null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function NutritionAtAGlance({ weeks, weightUnit = weeks[0]?.unit ?? 'lb' }: { weeks: NutritionWeek[]; weightUnit?: 'lb' | 'kg' }) {
  const totals = nutritionTotals(weeks);
  const unit = weightUnit;
  return <section aria-label="Nutritional mesocycle at a glance" className="grid gap-4 border-b border-line py-5 sm:grid-cols-3">
    <SummaryValue label={`Predicted Mesocycle Weight Change (${unit})`} value={totals.predictedChange} detail={`${totals.predictedWeeks} ${totals.predictedWeeks === 1 ? 'week' : 'weeks'} with calorie data · estimate`} />
    <SummaryValue label={`Actual Mesocycle Weight Change (${unit})`} value={totals.actualChange} detail={`${totals.measuredWeeks} ${totals.measuredWeeks === 1 ? 'week' : 'weeks'} with sufficient weigh-ins`} />
    <SummaryValue label={`Average Weight Change Per Week (${unit})`} value={totals.averageChange} detail="Uses weeks with sufficient weight data" />
  </section>;
}
function SummaryValue({ label, value, detail }: { label: string; value: number | null; detail: string }) {
  return <div><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-medium tabular-nums">{nutritionNumber(value, 2)}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

export function NutritionSpreadsheet({ snapshot, draft, onDirty }: { snapshot: NutritionProgramSnapshot; draft: NutritionProgramDraft; onDirty: (week: number, dirty: boolean) => void }) {
  const weeks = nutritionWeeks(draft, snapshot.weights, snapshot.entries, snapshot.today);
  return <div className="grid min-w-0 gap-8">
    <NutritionAtAGlance weeks={weeks} weightUnit={draft.weight_unit} />
    <NutritionTrendChart weeks={weeks} today={snapshot.today} weightUnit={draft.weight_unit} />
    <p className="text-xs text-muted">Weight in {draft.weight_unit} · calories in kcal{snapshot.can_log ? ' · entries save when you leave a cell' : ''}</p>
    {weeks.some((week)=>week.rows.some((row)=>[1,2,3].some((column)=>nutritionGridCoachEdited(week,{exerciseId:row.date,column})))) ? <p className="inline-flex items-center gap-2 text-xs text-muted"><span aria-hidden className="size-2 rounded-full bg-gold/60" />Coach-edited cells</p> : null}
    {!draft.start_date ? <p className="text-sm text-muted">Choose a Start Date to see the weekly spreadsheets.</p> : null}
    {weeks.map((week) => <WeeklySheet key={`${snapshot.revision.id}:${week.from}:${week.unit}`} week={week} snapshot={snapshot} onDirty={onDirty} />)}
  </div>;
}

function WeeklySheet({ week, snapshot, onDirty }: { week: NutritionWeek; snapshot: NutritionProgramSnapshot; onDirty: (week: number, dirty: boolean) => void }) {
  const labels=nutritionGridLabels(week.unit);
  const table=useRef<HTMLTableElement>(null);
  const id=useId();
  const grid=useNutritionGrid(week,snapshot,table,onDirty);
  const {top,bottom,left,right}=grid.range;
  return <section className="grid min-w-0 gap-3" aria-labelledby={`${id}-heading`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 id={`${id}-heading`} className="text-base font-semibold">Week {week.index+1}</h3><p className="mt-1 text-xs text-muted">{formatDate(week.from)}–{formatDate(week.through)}</p></div>
      <div role="group" aria-label={`Week ${week.index+1} spreadsheet actions`} className="flex gap-1">
        <Button variant="ghost" disabled={!grid.canUndo} onClick={()=>grid.historyAction('undo')}>Undo</Button>
        <Button variant="ghost" disabled={!grid.canRedo} onClick={()=>grid.historyAction('redo')}>Redo</Button>
      </div>
    </div>
    <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
        <SpreadsheetViewport>
          <table ref={table} role="grid" aria-label={`Week ${week.index+1} nutrition spreadsheet`} aria-multiselectable="true" aria-rowcount={8} aria-colcount={6}
            className="w-full min-w-[47rem] select-none border-separate border-spacing-0 text-sm"
            onPointerDownCapture={grid.drag.resetClick} onPointerMove={grid.drag.move} onPointerUp={grid.drag.finish} onPointerCancel={grid.drag.stop} onLostPointerCapture={grid.drag.stop} onClickCapture={grid.drag.click}
            onFocusCapture={()=>grid.setFocused(true)} onBlurCapture={(e)=>{if(!e.currentTarget.contains(e.relatedTarget))grid.setFocused(false);}}
            onCopy={(e)=>{if(grid.editRef.current)return;e.preventDefault();e.clipboardData.setData('text/plain',grid.clipboard());}}
            onCut={(e)=>{if(grid.editRef.current)return;e.preventDefault();e.clipboardData.setData('text/plain',grid.clipboard());grid.clear();}}
            onPaste={(e)=>{const raw=e.clipboardData.getData('text/plain');if(grid.editRef.current&&!/[\t\r\n]/.test(raw))return;e.preventDefault();grid.preparePaste(raw);}}>
            <colgroup><col className="w-28"/><col className="w-24"/><col className="w-36"/><col className="w-36"/><col className="w-28"/><col className="w-28"/></colgroup>
            <thead className="sticky top-0 z-10 bg-surface-raised"><tr role="row">{labels.map((label)=><th key={label} scope="col" role="columnheader" className="border-b border-r border-line px-3 py-2 text-left text-xs font-medium text-muted">{label}</th>)}</tr></thead>
            <tbody>{week.rows.map((row,r)=><tr key={row.date} id={`nutrition-day-${row.date}`} role="row" aria-rowindex={r+2} data-grid-exercise={row.date}>
              {NUTRITION_GRID_COLUMNS.map((column,c)=>{
                const point={exerciseId:row.date,column:c};
                const current=grid.active.exerciseId===row.date&&grid.active.column===c;
                const selected=grid.focused&&r>=top&&r<=bottom&&c>=left&&c<=right;
                const editable=grid.canWrite&&nutritionGridEditable(point,snapshot.today);
                const edit=grid.editing?.exerciseId===row.date&&grid.editing.column===c?grid.editing:null;
                const rejected=!!grid.error&&grid.hasBuffer(point);
                const value=grid.text(point);
                const record=column==='weight'?row.weight:column==='intake'||column==='output'?row.entry:null;
                const coachEdited=nutritionGridCoachEdited(week,point);
                const title=[coachEdited?'Edited by coach':'',c>=2&&c<=3?`Calories for ${formatDate(row.activityDate)}`:'',c>=4?'Calculated automatically':'',c===0?'Date follows the program Start Date':'',c>=1&&c<=3&&row.date>snapshot.today?'Future dates are read-only':'',record&&!coachEdited?`Saved ${formatDateTime(record.updated_at)}`:''].filter(Boolean).join(' · ');
                return <td key={column} role="gridcell" aria-colindex={c+1} aria-selected={selected} aria-readonly={!editable} aria-invalid={rejected||undefined} aria-describedby={rejected?`${id}-error`:undefined}
                  aria-label={`${labels[c]}, ${formatDate(row.date)}${coachEdited?', Edited by coach':''}`} title={title} data-grid-column={column} data-grid-column-index={c} tabIndex={current?0:-1}
                  className={`relative scroll-mt-24 border-b border-r border-line p-0 align-top focus:z-[1] focus:outline-2 focus:-outline-offset-2 focus:outline-gold ${selected?'bg-gold/10':coachEdited?'bg-gold/5':''} ${!nutritionGridEditable(point,snapshot.today)?'text-muted':''} ${rejected?'bg-danger/10 ring-1 ring-inset ring-danger/50':''}`}
                  onPointerDown={(e)=>grid.drag.start(e,point,e.shiftKey?grid.anchor:point)}
                  onClick={(e)=>{if(!edit)grid.focus(point,e.shiftKey);}}
                  onDoubleClick={()=>grid.beginEdit(point)} onKeyDown={(e)=>grid.keyDown(e,point)}
                  onContextMenu={(e)=>{e.preventDefault();grid.finishEdit();if(!selected)grid.focus(point);grid.setMenu({x:e.clientX,y:e.clientY});}}>
                  {edit?<input autoFocus inputMode="decimal" aria-label={`Edit ${labels[c]} for ${formatDate(row.date)}`} aria-invalid={rejected||undefined} value={edit.text}
                    onFocus={(e)=>{if(edit.select)e.currentTarget.select();else e.currentTarget.setSelectionRange(edit.text.length,edit.text.length);}}
                    onChange={(e)=>grid.changeText(e.target.value)} onBlur={()=>grid.finishEdit()}
                    className="min-h-11 w-full min-w-0 select-text bg-ink px-3 text-right text-base text-text outline-2 -outline-offset-2 outline-gold sm:text-sm"/>
                    :<span className={`block min-h-11 whitespace-pre-wrap break-words px-3 py-3 tabular-nums ${c===0?'text-left text-xs':'text-right'}`}>{c===0?formatDate(row.date):value===''?'\u00a0':c>=4?nutritionNumber(Number(value),c===4?0:1):value}</span>}
                  {coachEdited ? <span aria-hidden className="pointer-events-none absolute right-1 top-1 size-1 rounded-full bg-gold/60" /> : null}
                </td>;
              })}
            </tr>)}</tbody>
          </table>
        </SpreadsheetViewport>
      </div>
      <div className="relative min-w-0 overflow-hidden rounded-card border border-line bg-surface xl:min-h-0">
        <div className="grid grid-rows-[minmax(0,3fr)_minmax(0,2fr)_auto] xl:absolute xl:inset-0 xl:overflow-auto">
          <ValuesTable title="Weekly Caloric Values" icon={<StimulusIcon/>} rows={[
            ['Average Caloric Balance',week.averageBalance,'kcal'],['Average Weekly Caloric Output',week.averageOutput,'kcal'],['Weekly Caloric Balance',week.weeklyBalance,'kcal'],
          ]}/>
          <ValuesTable title="Weekly Weight Values" icon={<ProgressIcon/>} rows={[
            ['Predicted Weight Change',week.predictedChange,week.unit],['Average Weight Change',week.change,week.unit],
          ]}/>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">{week.pairCount}/7 calorie pairs · {week.outputCount}/7 output entries · {week.average.count}/7 weigh-ins{week.pairCount<7?' · partial calorie week':''}</p>
        </div>
      </div>
    </div>
    <div className="grid gap-2" id={`${id}-error`}>
      <Alert visible={!!grid.error} title="Entries not saved">{grid.error}</Alert>
      {grid.error||grid.dirty&&!grid.editing?<div className="flex flex-wrap gap-2">{snapshot.can_log?<Button variant="secondary" busy={grid.save.isPending} onClick={()=>grid.retry()}>{grid.error?'Retry save':'Save entries'}</Button>:null}<Button variant="ghost" disabled={grid.save.isPending} onClick={()=>grid.discard()}>Discard unsaved edits</Button></div>:null}
      <p role="status" className="min-h-4 text-xs text-muted">{grid.save.isPending?'Saving entries…':grid.dirty?'Unsaved entries':grid.message}</p>
    </div>
    {grid.paste?<Dialog title="Review pasted values" description="Only editable input cells will change. Dates and calculated cells are kept." onClose={()=>grid.setPaste(null)} footer={<><Button variant="secondary" onClick={()=>grid.setPaste(null)}>Cancel</Button><Button onClick={()=>grid.applyPaste()}>Apply paste</Button></>}>
      <SpreadsheetViewport><table className="w-full text-sm"><thead><tr>{['Cell','Before','After'].map((label)=><th key={label} className="border-b border-line px-4 py-2 text-left text-xs text-muted">{label}</th>)}</tr></thead><tbody>{grid.paste.map((edit)=><tr key={`${edit.date}:${edit.column}`}><th scope="row" className="border-b border-line p-3 text-left text-xs font-normal">{formatDate(edit.date)} · {labels[NUTRITION_GRID_COLUMNS.indexOf(edit.column)]}</th><td className="border-b border-line p-3">{nutritionGridText(week,{exerciseId:edit.date,column:NUTRITION_GRID_COLUMNS.indexOf(edit.column)})||'—'}</td><td className="border-b border-line p-3">{edit.text||'—'}</td></tr>)}</tbody></table></SpreadsheetViewport>
    </Dialog>:null}
    {grid.menu?<GridPopupMenu x={grid.menu.x} y={grid.menu.y} label="Spreadsheet cells" onClose={(restore)=>{grid.setMenu(null);if(restore)grid.focus(grid.active);}} onAction={grid.menuAction} items={[
      {action:'copy',label:'Copy selection',icon:<CopyIcon/>},
      {action:'cut',label:'Cut selection',icon:<CopyIcon/>,disabled:!grid.canWrite},
      {action:'paste',label:'Paste…',icon:<CopyIcon/>,disabled:!grid.canWrite},
      {action:'clear',label:'Clear input cells',icon:<TrashIcon/>,disabled:!grid.canWrite,separator:true},
      {action:'undo',label:'Undo',icon:<span aria-hidden>↶</span>,disabled:!grid.canUndo},
      {action:'redo',label:'Redo',icon:<span aria-hidden>↷</span>,disabled:!grid.canRedo},
    ]}/>:null}
  </section>;
}

function ValuesTable({title,icon,rows}:{title:string;icon:ReactNode;rows:[string,number|null,string][]}) {
  return <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]"><h4 className="border-b border-line bg-surface-raised px-3 py-2 text-left text-xs font-medium text-muted"><span className="inline-flex items-center gap-2"><span aria-hidden className="[&>svg]:size-4">{icon}</span>{title}</span></h4><table aria-label={title} className="h-full w-full border-separate border-spacing-0 text-sm">
    <tbody>{rows.map(([label,value,unit])=><tr key={label}><th scope="row" className="border-b border-r border-line px-3 py-3 text-left text-xs font-normal text-muted">{label}</th><td className="whitespace-nowrap border-b border-line px-3 py-3 text-right tabular-nums">{nutritionNumber(value,(unit==='lb'||unit==='kg')?2:label.startsWith('Average')?1:0)}{value!==null?<span className="ml-1 text-xs text-muted">{unit}</span>:null}</td></tr>)}</tbody>
  </table></section>;
}
