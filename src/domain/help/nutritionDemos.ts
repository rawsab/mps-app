import { shiftDate, type NutritionEntry, type WeighIn } from '@/domain/nutrition';
import { NUTRITION_GRID_COLUMNS } from '@/domain/nutritionGrid';
import { nutritionWeeks, planNutritionCells, type NutritionProgramDraft } from '@/domain/nutritionProgram';
import { typing, type DemoFrame, type DemoScript } from './demo';

/*
 * Nutrition spreadsheet demos for Help (decision 0057, phase 2). A fictional client's weigh-ins and
 * calorie logs go through `nutritionWeeks` when drawn, so every calculated cell is the app's own
 * maths. A log made on a date holds that morning's weight and the day before's calories, on one row.
 */

export const NUTRITION_DEMO_PROGRAM: NutritionProgramDraft = {
  program_style: 'Lean gain', start_date: '2026-11-02', weight_unit: 'lb', week_count: 1, maintenance: 2600, calorie_goal: 2850, notes: '',
};

export type NutritionDemoColumn = (typeof NUTRITION_GRID_COLUMNS)[number];
export type NutritionDemoCell = { date: string; column: NutritionDemoColumn };

export type NutritionDemoState = {
  today: string;
  weights: WeighIn[];
  entries: NutritionEntry[];
  /** Highlights missing entries, as the client's own spreadsheet does. The coach's leaves them blank. */
  showMissing: boolean;
  selection?: NutritionDemoCell | null;
  editing?: (NutritionDemoCell & { text: string }) | null;
  changed?: NutritionDemoCell[];
  /** The cell's hover note ("Calories for …"). Kept while hidden, so it fades out as well as in. */
  tip?: (NutritionDemoCell & { shown: boolean }) | null;
  /** The client's daily log, open over the spreadsheet, with what they've typed so far. */
  clientLog?: { weight: string; intake: string; output: string } | null;
  /** Correction history, open, listing these corrections. */
  history?: { activityDate: string; before: NutritionEntry; after: NutritionEntry }[] | null;
};

export const nutritionCellTarget = (cell: NutritionDemoCell) => `nutrition:${cell.date}:${cell.column}`;
export const CLIENT_LOG_SAVE_TARGET = 'client-log-save';
export const HISTORY_TARGET = 'correction-history';

const stamp = { version: 1, updated_at: '2026-11-01T12:00:00Z' };
const weigh = (date: string, weight: number): WeighIn => ({ measured_on: date, weight, unit: 'lb', ...stamp, updated_by_staff: false });
/** A log made on `date`: the calories belong to the day before. */
const calories = (date: string, intake: number | null, output: number | null): NutritionEntry => ({
  activity_on: shiftDate(date, -1), intake, output, notes: '', ...stamp, updated_by_staff: false,
});

const DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'] as const;
const [MON, TUE, WED, THU, FRI] = DAYS;
const LOGS: Record<string, [weight: number, intake: number, output: number]> = {
  [MON]: [172.4, 2850, 2600], [TUE]: [172.1, 2790, 2640], [WED]: [172.6, 2900, 2580], [THU]: [172.9, 2810, 2700], [FRI]: [172.7, 2760, 2650],
};
const logsThrough = (last: string) => {
  const dates = DAYS.filter((d) => d <= last);
  return { weights: dates.map((d) => weigh(d, LOGS[d]![0])), entries: dates.map((d) => calories(d, LOGS[d]![1], LOGS[d]![2])) };
};
const rowCells = (date: string, ...columns: NutritionDemoColumn[]) => columns.map((column) => ({ date, column }));

type Frame = DemoFrame<NutritionDemoState>;

/** A week filling in, one morning at a time. */
function weekFillingIn(): DemoScript<NutritionDemoState> {
  const monday = { today: MON, showMissing: false, ...logsThrough(MON) };
  const tuesday = { today: TUE, showMissing: false, ...logsThrough(TUE) };
  const [weight, intake, output] = LOGS[TUE]!.map(String) as [string, string, string];
  const log = (typed: Partial<NonNullable<NutritionDemoState['clientLog']>>) => ({ ...monday, clientLog: { weight: '', intake: '', output: '', ...typed } });
  const opening = 'Tuesday morning, the client logs today’s weight and yesterday’s calories.';
  const frames: Frame[] = [
    { state: monday, ms: 1600, caption: 'Each row is one morning’s log.' },
    { state: log({}), ms: 1000, caption: opening },
    ...typing<NutritionDemoState>(weight, 90, (text) => ({ state: log({ weight: text }), caption: opening })),
    ...typing<NutritionDemoState>(intake, 90, (text) => ({ state: log({ weight, intake: text }), caption: opening })),
    ...typing<NutritionDemoState>(output, 90, (text) => ({ state: log({ weight, intake, output: text }), caption: opening })),
    { state: log({ weight, intake, output }), ms: 700, caption: opening, pointer: { target: CLIENT_LOG_SAVE_TARGET } },
    { state: log({ weight, intake, output }), ms: 400, caption: opening, pointer: { target: CLIENT_LOG_SAVE_TARGET, press: true } },
    { state: { ...tuesday, changed: rowCells(TUE, 'weight', 'intake', 'output', 'balance'), tip: { date: TUE, column: 'intake', shown: false } }, ms: 1800, caption: 'All three go on Tuesday’s row.', pointer: { target: nutritionCellTarget({ date: TUE, column: 'intake' }) } },
    { state: { ...tuesday, tip: { date: TUE, column: 'intake', shown: true } }, ms: 2600, caption: 'The calories are Monday’s, so they sit under Calories Consumed Day Before.', pointer: { target: nutritionCellTarget({ date: TUE, column: 'intake' }) } },
    { state: { today: WED, showMissing: false, ...logsThrough(WED), changed: rowCells(WED, 'weight', 'intake', 'output', 'balance', 'average'), tip: { date: TUE, column: 'intake', shown: false } }, ms: 2800, caption: 'After three weigh-ins, Average Weight fills in. Balance is consumed minus output.', pointer: { target: nutritionCellTarget({ date: WED, column: 'average' }) } },
    { state: { today: THU, showMissing: false, ...logsThrough(THU), changed: rowCells(THU, 'weight', 'intake', 'output', 'balance', 'average') }, ms: 2400, caption: 'Each morning adds a row. Later dates stay greyed out until then.', pointer: { target: nutritionCellTarget({ date: THU, column: 'balance' }) } },
  ];
  return { id: 'nutrition-week', description: 'A client logs each morning. Each log fills one row: that morning’s weight and the previous day’s calories, with the balance and average weight worked out.', frames };
}

/** Spotting a missing entry, correcting a wrong one, and seeing it in Correction history, as the coach sees them. */
function missingAndCorrection(): DemoScript<NutritionDemoState> {
  const base = logsThrough(FRI);
  // Wednesday's log has no calories, and Thursday's has a typo: 28100 instead of 2810.
  const typo = calories(THU, 28100, LOGS[THU]![2]);
  const entries = base.entries.filter((e) => e.activity_on !== shiftDate(WED, -1)).map((e) => (e.activity_on === typo.activity_on ? typo : e));
  const start: NutritionDemoState = { today: FRI, showMissing: false, weights: base.weights, entries };
  const cell: NutritionDemoCell = { date: THU, column: 'intake' };
  // Planned as the spreadsheet plans a coach's edit; a refused edit is a broken script.
  const [plan] = planNutritionCells(nutritionWeeks(NUTRITION_DEMO_PROGRAM, start.weights, start.entries, FRI), [{ ...cell, column: 'intake', text: '2810' }], FRI);
  if (!plan || plan.kind !== 'nutrition') throw new Error('Demo correction was not planned as a calorie entry');
  const value = plan.value as { intake: number | null; output: number | null };
  const fixed: NutritionEntry = { ...typo, intake: value.intake, output: value.output, intake_updated_by_staff: true, updated_by_staff: true, version: 2 };
  const corrected: NutritionDemoState = { ...start, entries: entries.map((e) => (e.activity_on === typo.activity_on ? fixed : e)) };
  const history = [{ activityDate: typo.activity_on, before: typo, after: fixed }];
  const fix = 'Select it and type the right number.';
  const frames: Frame[] = [
    { state: start, ms: 2000, caption: 'A blank cell means the client didn’t log it.', pointer: { target: nutritionCellTarget({ date: WED, column: 'intake' }) } },
    { state: start, ms: 1600, caption: 'This one looks wrong: 28,100 calories.', pointer: { target: nutritionCellTarget(cell) } },
    { state: { ...start, selection: cell }, ms: 500, caption: fix, pointer: { target: nutritionCellTarget(cell), press: true } },
    ...typing<NutritionDemoState>('2810', 130, (text) => ({ state: { ...start, editing: { ...cell, text } }, caption: fix, pointer: { target: nutritionCellTarget(cell) } })),
    { state: { ...start, editing: { ...cell, text: '2810' } }, ms: 600, caption: fix, keys: ['Enter'], pointer: { target: nutritionCellTarget(cell) } },
    { state: { ...corrected, selection: cell, changed: rowCells(THU, 'intake', 'balance') }, ms: 2600, caption: 'It saves to the client’s record straight away, with a light gold tint.', pointer: { target: nutritionCellTarget({ date: THU, column: 'balance' }) } },
    { state: corrected, ms: 900, caption: 'Correction history shows what changed.', pointer: { target: HISTORY_TARGET } },
    { state: corrected, ms: 400, caption: 'Correction history shows what changed.', pointer: { target: HISTORY_TARGET, press: true } },
    { state: { ...corrected, history }, ms: 3200, caption: 'Each correction is listed by the day the calories were eaten, before and after.', pointer: { target: HISTORY_TARGET } },
  ];
  return { id: 'nutrition-correction', description: 'A missing calorie entry shows as a blank cell. A wrong entry of 28,100 is corrected to 2,810, which tints the cell and adds a coach correction to Correction history.', frames };
}

export const NUTRITION_DEMOS = {
  'nutrition-week': weekFillingIn(),
  'nutrition-correction': missingAndCorrection(),
} satisfies Record<string, DemoScript<NutritionDemoState>>;

export type NutritionDemoName = keyof typeof NUTRITION_DEMOS;
