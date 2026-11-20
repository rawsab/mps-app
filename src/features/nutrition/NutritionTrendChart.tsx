import { useEffect, useId, useRef, useState } from 'react';
import { SelectField } from '@/components/ui';
import { shiftDate } from '@/domain/nutrition';
import type { NutritionWeek } from '@/domain/nutritionProgram';
import { NUTRITION_TREND_METRICS, nutritionTrendPoints, nutritionTrendScale, type NutritionTrendMetric } from '@/domain/nutritionTrends';
import { ChartTooltip } from '@/components/Tooltip';

const dayLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const valueLabel = (value: number, weight: boolean) => value.toLocaleString(undefined, { maximumFractionDigits: weight ? 2 : 0 });

export function NutritionTrendChart({ weeks, today, weightUnit }: { weeks: NutritionWeek[]; today: string; weightUnit: 'lb' | 'kg' }) {
  const [metric, setMetric] = useState<NutritionTrendMetric>('weight');
  const [days, setDays] = useState<7 | 30>(7);
  return <section className="grid min-w-0 gap-4" aria-label="Nutrition trends">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h3 className="text-base font-semibold">Trends</h3>
      <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:min-w-80">
        <SelectField label="Data" value={metric} onChange={(e) => setMetric(e.target.value as NutritionTrendMetric)}>{Object.entries(NUTRITION_TREND_METRICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        <SelectField label="Range" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30)}><option value={7}>Last 7 Days</option><option value={30}>Last 30 Days</option></SelectField>
      </div>
    </div>
    <TrendPlot key={`${metric}:${days}:${weightUnit}`} weeks={weeks} today={today} weightUnit={weightUnit} metric={metric} days={days} />
  </section>;
}

function TrendPlot({ weeks, today, weightUnit, metric, days }: { weeks: NutritionWeek[]; today: string; weightUnit: 'lb' | 'kg'; metric: NutritionTrendMetric; days: 7 | 30 }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<{ date: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(240, element.clientWidth)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const points = nutritionTrendPoints(weeks, metric, days, today);
  const enough = points.length >= 2;
  const { min, max } = nutritionTrendScale(points, metric);
  const left = 58, right = width - 24, top = 16, bottom = 236, height = 276;
  const from = shiftDate(today, 1 - days);
  const dayOffset = (date: string) => (Date.parse(date) - Date.parse(from)) / 86400000;
  const x = (date: string) => left + dayOffset(date) / (days - 1) * (right - left);
  const y = (value: number) => bottom - (value - min) / (max - min) * (bottom - top);
  const plotted = points.map((point) => ({ ...point, x: x(point.date), y: y(point.value) }));
  const line = plotted.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const baseline = y(Math.max(min, Math.min(0, max)));
  const area = enough ? `${line} L${plotted.at(-1)!.x},${baseline} L${plotted[0]!.x},${baseline} Z` : '';
  const active = hover ? plotted.find((p) => p.date === hover.date) : undefined;
  const unit = metric === 'weight' ? weightUnit === 'lb' ? 'lbs' : 'kg' : 'kcal';
  const ticks = width < 480 ? [0, Math.round((days - 1) / 2), days - 1] : [0, ...[1, 2, 3].map((i) => Math.round((days - 1) * i / 4)), days - 1];
  return <div ref={ref} className="relative min-w-0" onPointerLeave={() => setHover(null)}>
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${NUTRITION_TREND_METRICS[metric]}, last ${days} days, ${unit}`}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.3" /><stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const value = min + (max - min) * i / 4, at = y(value);
        return <g key={i} aria-hidden><line x1={left} x2={right} y1={at} y2={at} className="stroke-line" strokeOpacity={i === 0 ? 1 : 0.45} /><text x={left - 9} y={at + 4} textAnchor="end" className="fill-muted text-[10px] tabular-nums">{valueLabel(value, metric === 'weight')}</text></g>;
      })}
      <path d={`M${left},${top} V${bottom} H${right}`} fill="none" className="stroke-line" />
      {ticks.map((offset) => {
        const date = shiftDate(from, offset), at = x(date);
        return <g key={offset} aria-hidden><line x1={at} x2={at} y1={bottom} y2={bottom + 5} className="stroke-line" /><text x={at} y={bottom + 23} textAnchor="middle" className="fill-muted text-[11px]">{dayLabel(date)}</text></g>;
      })}
      {enough ? <>
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" className="stroke-gold" strokeWidth={2} strokeLinejoin="round" />
        {active ? <line x1={active.x} x2={active.x} y1={top} y2={bottom} className="stroke-muted" strokeDasharray="3 4" strokeOpacity="0.5" /> : null}
        {plotted.map((point) => <g key={point.date}>
          <circle cx={point.x} cy={point.y} r={active?.date === point.date ? 5 : 3.5} className="fill-gold stroke-surface" strokeWidth={2} />
          <circle cx={point.x} cy={point.y} r={10} fill="transparent" tabIndex={0} role="img" aria-label={`${valueLabel(point.value, metric === 'weight')} ${unit}, ${dayLabel(point.date)}`} onFocus={() => setHover({ date: point.date, x: point.x, y: point.y })} onBlur={() => setHover(null)} onKeyDown={(event) => { if (event.key === 'Escape') setHover(null); }} className="outline-none focus-visible:stroke-gold-fg" />
        </g>)}
        <rect x={left} y={top} width={right - left} height={bottom - top} fill="transparent" onPointerMove={(event) => {
          const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
          const px = (event.clientX - box.left) * width / box.width;
          const closest = plotted.reduce((best, point) => Math.abs(point.x - px) < Math.abs(best.x - px) ? point : best);
          setHover({ date: closest.date, x: event.clientX - box.left, y: event.clientY - box.top });
        }} />
      </> : null}
    </svg>
    {!enough ? <p className="pointer-events-none absolute inset-x-16 top-1/2 -translate-y-1/2 text-center text-sm text-muted/60">Trends will be available when there is sufficient data.</p> : null}
    {active && hover ? <ChartTooltip x={Math.max(66, Math.min(width - 66, hover.x))} y={Math.max(58, hover.y - 8)}>
      <span className="font-medium tabular-nums text-text">{valueLabel(active.value, metric === 'weight')} {unit}</span><span className="text-muted">{dayLabel(active.date)}</span>
    </ChartTooltip> : null}
  </div>;
}
