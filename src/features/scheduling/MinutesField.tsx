import { SelectField, TextField } from '@/components/ui';

/** Personal training lengths with a default price (decision 0053). */
export const PT_MINUTES = ['60', '40'] as const;

/**
 * A meeting's length. Personal training picks 60 or 40 minutes, so every session has a price; a meeting
 * that already has another length keeps it as an option. Other meetings take any length.
 */
export function MinutesField({ value, onChange, pt }: { value: string; onChange: (value: string) => void; pt: boolean }) {
  if (!pt) {
    return <TextField label="Minutes" type="text" inputMode="numeric" maxLength={3} value={value} onChange={(event) => onChange(event.target.value)} />;
  }
  const other = !(PT_MINUTES as readonly string[]).includes(value) && /^\d{1,3}$/.test(value);
  return (
    <SelectField label="Minutes" value={other ? value : (PT_MINUTES as readonly string[]).includes(value) ? value : '60'} onChange={(event) => onChange(event.target.value)}>
      {PT_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
      {other ? <option value={value}>{value} min (no default price)</option> : null}
    </SelectField>
  );
}
