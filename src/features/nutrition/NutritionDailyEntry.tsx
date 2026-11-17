import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, TextField } from '@/components/ui';
import { CheckCircleIcon } from '@/components/icons';
import { convertWeight, shiftDate } from '@/domain/nutrition';
import { NutritionDailyInput, nutritionWeeks, planNutritionCells, type NutritionCellEdit, type NutritionProgramSnapshot } from '@/domain/nutritionProgram';
import { formatDate } from '@/lib/format';
import { nutritionError } from './api';
import { fetchNutritionProgram, useSaveNutritionCells, type SheetEntry } from './programApi';

type Fields = { weight: string; intake: string; output: string };
const labels: Record<keyof Fields,string> = { weight: 'Today’s weight', intake: 'Calories consumed yesterday', output: 'Caloric output yesterday' };
function fieldsFor(snapshot: NutritionProgramSnapshot): Fields {
  const weight = snapshot.weights.find((w) => w.measured_on === snapshot.today);
  const entry = snapshot.entries.find((n) => n.activity_on === shiftDate(snapshot.today,-1));
  return { weight: weight?.weight != null ? String(Math.round(convertWeight(weight.weight,weight.unit,snapshot.revision.weight_unit)*10000)/10000) : '', intake: entry?.intake?.toString() ?? '', output: entry?.output?.toString() ?? '' };
}

/** Three fields, one atomic save. Completion always comes from acknowledged server records. */
export function NutritionDailyEntry({ snapshot, onDirty }: { snapshot: NutritionProgramSnapshot; onDirty: (key: number, dirty: boolean) => void }) {
  const [base,setBase] = useState(snapshot);
  const appliedSnapshot=useRef(snapshot);
  const [fields,setFields] = useState<Fields>(() => fieldsFor(snapshot));
  const [dirty,setDirty] = useState(false);
  const [fieldErrors,setFieldErrors] = useState<Partial<Fields>>({});
  const [error,setError] = useState('');
  const [reloading,setReloading] = useState(false);
  const request = useRef<SheetEntry[] | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const save = useSaveNutritionCells(snapshot.id,snapshot.revision.id);
  useEffect(() => { onDirty(-1,dirty || save.isPending); return () => onDirty(-1,false); },[dirty,save.isPending,onDirty]);
  useEffect(() => {
    if (dirty || save.isPending || request.current || appliedSnapshot.current===snapshot) return;
    appliedSnapshot.current=snapshot;
    setBase(snapshot); setFields(fieldsFor(snapshot));
  },[snapshot,dirty,save.isPending]);
  const day=dirty || save.isPending || request.current ? base.today : snapshot.today;
  const persisted = fieldsFor(dirty ? {...snapshot,today:day} : base);
  const complete = (key: keyof Fields) => persisted[key] !== '' && fields[key] !== '' && Number(fields[key]) === Number(persisted[key]);
  const done = complete('weight') && complete('intake') && complete('output') && !save.isPending;
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const errors: Partial<Fields> = {};
    for (const key of Object.keys(fields) as (keyof Fields)[]) if (fields[key].trim() === '') errors[key] = key === 'weight' ? 'Enter today’s weight.' : 'Enter yesterday’s calories. Use 0 only for an actual zero.';
    const parsed = NutritionDailyInput.safeParse({ weight:Number(fields.weight),intake:Number(fields.intake),output:Number(fields.output) });
    if (!parsed.success) for (const issue of parsed.error.issues) errors[issue.path[0] as keyof Fields] ??= issue.message;
    setFieldErrors(errors);
    if (Object.keys(errors).length) { form.current?.querySelector<HTMLInputElement>(`[name="${Object.keys(errors)[0]}"]`)?.focus(); return; }
    if (!request.current) {
      const original = fieldsFor(base);
      const edits: NutritionCellEdit[] = (Object.keys(fields) as (keyof Fields)[]).filter((key) => original[key] === '' || Number(fields[key]) !== Number(original[key])).map((column) => ({date:base.today,column,text:fields[column]}));
      if (!edits.length) { setDirty(false); return; }
      try { request.current = planNutritionCells(nutritionWeeks(base.revision,base.weights,base.entries,base.today),edits,base.today).map((row) => ({...row,request_id:crypto.randomUUID()})); }
      catch (e) { setError((e as Error).message); return; }
    }
    const rows=request.current;
    save.mutate(rows,{onSuccess:() => {
      // The write itself is acknowledged even if a following cache refetch loses its connection.
      // Keep those confirmed values until a newer server snapshot arrives.
      const acknowledged={...base,weights:[...base.weights],entries:[...base.entries]};
      for (const row of rows) {
        const attribution={version:row.expected_version+1,updated_at:new Date().toISOString(),updated_by_staff:false};
        if (row.kind==='weight') {
          const value={...attribution,measured_on:row.row_date,weight:row.value.weight as number,unit:row.value.unit as 'lb' | 'kg'};
          acknowledged.weights=[...acknowledged.weights.filter((w) => w.measured_on!==row.row_date),value];
        } else {
          const date=shiftDate(row.row_date,-1);
          const value={...attribution,activity_on:date,intake:row.value.intake as number|null,output:row.value.output as number|null,notes:row.value.notes as string};
          acknowledged.entries=[...acknowledged.entries.filter((n) => n.activity_on!==date),value];
        }
      }
      setBase(acknowledged); request.current=null; setDirty(false);
    },onError:(e) => setError(nutritionError(e))});
  }
  async function reload() {
    setReloading(true);
    try { const fresh=await fetchNutritionProgram(snapshot.id,true); request.current=null; setBase(fresh); setFields(fieldsFor(fresh)); setDirty(false); setError(''); setFieldErrors({}); save.reset(); }
    catch(e) { setError(nutritionError(e)); }
    finally { setReloading(false); }
  }
  return <section className={`rounded-card border p-4 transition-colors sm:p-5 ${done ? 'border-success/40 bg-success/5' : 'border-line bg-surface'}`} aria-labelledby="nutrition-daily-heading">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><CompletionCircle done={done} /><div><h2 id="nutrition-daily-heading" className="text-lg font-semibold">{day===snapshot.today ? 'Today’s daily entry' : 'Finish your daily entry'}</h2><p className="mt-0.5 text-sm text-muted">Weight for {formatDate(day)} · calories for {formatDate(shiftDate(day,-1))}</p></div></div>{done ? <Badge tone="success">{day===snapshot.today ? 'Complete for today' : 'Daily entry complete'}</Badge> : null}</div>
    <form ref={form} onSubmit={submit} noValidate><fieldset disabled={save.isPending || reloading || !snapshot.can_log} className="grid min-w-0 gap-4">
      <div className="grid gap-4 lg:grid-cols-3">{(Object.keys(fields) as (keyof Fields)[]).map((key) => <div key={key} className="grid content-start gap-2">
        <TextField name={key} label={key === 'weight' ? `Today’s weight (${base.revision.weight_unit})` : labels[key]} type="number" inputMode="decimal" step={key === 'weight' ? 'any' : 1} min={key === 'weight' ? 0.01 : 0} max={key === 'weight' ? 1500 : 30000} value={fields[key]} error={fieldErrors[key]}
          onChange={(e) => { setFields((old) => ({...old,[key]:e.target.value})); setDirty(true); setFieldErrors((old) => ({...old,[key]:undefined})); setError(''); request.current=null; }} />
        <span className={`flex items-center gap-1.5 text-xs ${complete(key) ? 'text-success' : 'text-muted'}`}><CompletionCircle done={complete(key)} small />{complete(key) ? 'Saved' : 'Not saved yet'}</span>
      </div>)}</div>
      <Alert visible={!!error} title="Daily entry not saved">{error}</Alert>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" busy={save.isPending} disabled={done && !dirty}>{request.current && error ? 'Retry save' : done ? 'Update daily entry' : 'Save daily entry'}</Button>
        {error ? <Button type="button" variant="secondary" busy={reloading} onClick={() => void reload()}>Reload saved entry</Button> : null}
        <span role="status" className={`text-sm ${done ? 'text-success' : 'text-muted'}`}>{save.isPending ? 'Saving your daily entry…' : done ? 'You’re all done for today.' : 'Three quick entries, then you’re done.'}</span>
      </div>
    </fieldset></form>
    {!snapshot.can_log && dirty ? <Button className="mt-3" variant="secondary" busy={reloading} onClick={() => void reload()}>Discard edits and load current program</Button> : null}
  </section>;
}
function CompletionCircle({done,small=false}:{done:boolean;small?:boolean}) {
  return <span aria-hidden className={`${small ? 'size-4 [&>svg]:size-4' : 'size-9 [&>svg]:size-9'} inline-flex shrink-0 ${done ? 'text-success' : 'text-muted'}`}>{done ? <CheckCircleIcon /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /></svg>}</span>;
}
