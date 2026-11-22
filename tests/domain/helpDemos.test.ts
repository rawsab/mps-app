import { describe, expect, it } from 'vitest';
import { demoProblems, demoSteps, typing } from '@/domain/help/demo';
import { DEMO_COLUMNS, SPREADSHEET_DEMOS, publishIssues } from '@/domain/help/spreadsheetDemos';
import { cellText, gridRows } from '@/domain/programs/grid';
import { NUTRITION_DEMOS, NUTRITION_DEMO_PROGRAM, type NutritionDemoState } from '@/domain/help/nutritionDemos';
import { nutritionGridCoachEdited, nutritionGridMissing, nutritionGridText } from '@/domain/nutritionGrid';
import { nutritionWeeks } from '@/domain/nutritionProgram';
import { AVAILABILITY_DEMOS, OPEN_TIMES_DAY, dayOpenTimes, dayWindows } from '@/domain/help/availabilityDemos';
import { BILLING_DEMOS, BILLING_DEMO_CHARGES, NEXT_SESSION, applyCredit, demoSummary } from '@/domain/help/billingDemos';
import { ATTENDANCE_ROWS, DEMO_NOW, DEMO_TIME_ZONE, MEETING_DEMOS, UNDO_NOTICE_TARGET, patternPreview } from '@/domain/help/meetingDemos';
import { statements } from '@/domain/billing/billing';
import { groupAttendanceByDay } from '@/domain/scheduling/attendance';
import { zonedDateTime } from '@/domain/scheduling/pattern';

const table = (draft: Parameters<typeof gridRows>[0]) => gridRows(draft).map((row) => DEMO_COLUMNS.map((c) => cellText(row, c)));

describe('help demo scripts', () => {
  it('are all valid, with a last frame to show under reduced motion', () => {
    for (const [name, script] of Object.entries(SPREADSHEET_DEMOS)) {
      expect(demoProblems(script), name).toEqual([]);
      expect(script.frames.at(-1), name).toBeDefined();
    }
  });

  it('only point at things the frame draws', () => {
    for (const [name, script] of Object.entries(SPREADSHEET_DEMOS)) {
      script.frames.forEach((frame, i) => {
        const target = frame.pointer?.target;
        if (!target?.startsWith('cell:')) return;
        const [, exerciseId, column] = target.split(':');
        expect(gridRows(frame.state.draft).some((row) => row.exerciseId === exerciseId), `${name} frame ${i}`).toBe(true);
        expect(DEMO_COLUMNS as readonly string[], `${name} frame ${i}`).toContain(column);
      });
    }
  });

  it('show what the editor really does', () => {
    const perSet = SPREADSHEET_DEMOS['per-set-targets'].frames;
    expect(table(perSet.at(-1)!.state.draft)[1]).toEqual(['2', 'Incline dumbbell press', '3', '10 / 8 / 6']);

    const drag = SPREADSHEET_DEMOS['drag-row'].frames;
    expect(table(drag.at(-1)!.state.draft).map((r) => `${r[0]} ${r[1]}`)).toEqual(['1 Bench press', '2 Cable fly', '3 Incline dumbbell press', '4 Assisted dip']);

    const undo = SPREADSHEET_DEMOS['select-delete-undo'].frames;
    const cleared = undo.find((f) => f.keys?.includes('Delete'))!.state.draft;
    expect(table(cleared).slice(0, 2).map((r) => r.slice(2))).toEqual([['', ''], ['', '']]);
    expect(table(undo.at(-1)!.state.draft)).toEqual(table(undo[0]!.state.draft));

    const paste = SPREADSHEET_DEMOS['paste-review'].frames;
    const review = paste.find((f) => f.state.paste)!.state.paste!;
    expect(review.changes.map((c) => `${c.exerciseId}.${c.column}: ${c.before} → ${c.after}`)).toEqual(['bench.sets: 3 → 4', 'bench.effort: 8-10 → 6-8', 'incline.effort: 10 → 10 / 8 / 6']);
    expect(table(paste.at(-1)!.state.draft).slice(0, 2).map((r) => r.slice(2))).toEqual([['4', '6-8'], ['3', '10 / 8 / 6']]);

    const publish = SPREADSHEET_DEMOS['publish-readiness'].frames;
    expect(publishIssues(publish[0]!.state.draft)).toEqual(['Exercise needs a name', 'Unnamed exercise: set count is missing']);
    expect(publishIssues(publish.at(-1)!.state.draft)).toEqual([]);
    expect(publish.at(-1)!.state.publishing?.published).toBe(true);
  });

  it('point at every publish issue the readiness list shows', () => {
    for (const frame of SPREADSHEET_DEMOS['publish-readiness'].frames) {
      const target = frame.pointer?.target;
      if (target?.startsWith('issue:')) expect(Number(target.slice(6))).toBeLessThan(publishIssues(frame.state.draft).length);
    }
  });
});

describe('demo helpers', () => {
  it('types one character per frame', () => {
    expect(typing('ab', 100, (text) => ({ state: text, caption: 'Type' })).map((f) => f.state)).toEqual(['a', 'ab']);
  });

  it('lists each step once, in order', () => {
    expect(demoSteps({ id: 'x', description: 'x', frames: [{ state: 0, ms: 100, caption: 'A' }, { state: 1, ms: 100, caption: 'A' }, { state: 2, ms: 100, caption: 'B' }] })).toEqual(['A', 'B']);
  });

  it('flags empty captions, short frames and dashes', () => {
    expect(demoProblems({ id: 'x', description: 'Bad — script', frames: [{ state: 0, ms: 10, caption: '' }] })).toHaveLength(3);
  });
});

describe('nutrition demo scripts', () => {
  const week = (state: NutritionDemoState) => nutritionWeeks(NUTRITION_DEMO_PROGRAM, state.weights, state.entries, state.today)[0]!;
  const text = (state: NutritionDemoState, date: string, column: number) => nutritionGridText(week(state), { exerciseId: date, column });

  it('are all valid, and only point at cells that exist', () => {
    for (const [name, script] of Object.entries(NUTRITION_DEMOS)) {
      expect(demoProblems(script), name).toEqual([]);
      for (const frame of script.frames) {
        const target = frame.pointer?.target;
        if (target?.startsWith('nutrition:')) expect(week(frame.state).rows.some((row) => row.date === target.split(':')[1]), `${name}: ${target}`).toBe(true);
      }
    }
  });

  it('put a morning’s weight and the day before’s calories on one row', () => {
    const last = NUTRITION_DEMOS['nutrition-week'].frames.at(-1)!.state;
    const tuesday = week(last).rows.find((row) => row.date === '2026-11-03')!;
    expect(tuesday.activityDate).toBe('2026-11-02');
    expect([1, 2, 3, 4].map((c) => text(last, '2026-11-03', c))).toEqual(['172.1', '2790', '2640', '150']);
    // Average Weight needs three weigh-ins, so it starts on Wednesday.
    expect(text(last, '2026-11-03', 5)).toBe('');
    expect(text(last, '2026-11-04', 5)).not.toBe('');
  });

  it('correct the typo through the spreadsheet’s own plan, marked as a coach edit', () => {
    const frames = NUTRITION_DEMOS['nutrition-correction'].frames;
    expect(nutritionGridMissing({ exerciseId: '2026-11-04', column: 2 }, frames[0]!.state.today, text(frames[0]!.state, '2026-11-04', 2))).toBe(true);
    expect(text(frames[0]!.state, '2026-11-05', 2)).toBe('28100');
    const last = frames.at(-1)!.state;
    expect([2, 4].map((c) => text(last, '2026-11-05', c))).toEqual(['2810', '110']);
    expect(nutritionGridCoachEdited(week(last), { exerciseId: '2026-11-05', column: 2 })).toBe(true);
    expect(last.history?.[0]?.activityDate).toBe('2026-11-04');
  });
});

describe('meeting demo scripts', () => {
  it('are all valid', () => {
    expect(demoProblems(MEETING_DEMOS['attendance-undo'])).toEqual([]);
    expect(demoProblems(MEETING_DEMOS['repeating-pattern'])).toEqual([]);
  });

  it('only point at meetings still listed, or at Undo while a notice shows', () => {
    MEETING_DEMOS['attendance-undo'].frames.forEach((frame, i, frames) => {
      const target = frame.pointer?.target;
      // While a recorded row folds away, the pointer stays on the button it pressed.
      const waiting = target === frames[i - 1]?.pointer?.target && !frame.pointer?.press;
      if (target?.startsWith('attendance:') && !waiting) expect(frame.state.rows.map((r) => r.id), target).toContain(target.split(':')[1]);
      if (target === UNDO_NOTICE_TARGET) expect(frame.state.notice?.shown).toBe(true);
    });
  });

  it('records two meetings, with the mistaken no-show undone', () => {
    const frames = MEETING_DEMOS['attendance-undo'].frames;
    expect(frames.find((f) => f.state.restored)?.state.rows.map((r) => r.id)).toEqual(['avery', 'riley', 'jo']);
    expect(frames.at(-1)!.state.rows.map((r) => r.id)).toEqual(['riley', 'jo']);
    expect(frames.findLast((f) => f.state.notice?.shown)!.state.notice).toEqual({ id: 'avery', status: 'completed', shown: true });
    // It starts and ends centred, with no notice, so the loop joins up.
    expect([frames[0]!.state.room, frames.at(-1)!.state.room, frames.at(-1)!.state.notice?.shown]).toEqual([undefined, undefined, false]);
    // Grouped by day as the Meetings page groups them.
    expect(groupAttendanceByDay(ATTENDANCE_ROWS, DEMO_TIME_ZONE, DEMO_NOW).map((d) => d.relative)).toEqual(['today', 'yesterday', null]);
  });

  it('fills the next meetings from the chosen days, in date order', () => {
    const frames = MEETING_DEMOS['repeating-pattern'].frames;
    const last = frames.at(-1)!.state;
    // The dialog is reset behind the Meetings card, ready for the next loop.
    expect(last.slots).toEqual([]);
    expect(frames[0]!.state.slots).toEqual([]);
    const local = last.saved!.preview.map((item) => zonedDateTime(item.startsAt, DEMO_TIME_ZONE));
    expect(local.map((d) => `${d.date} ${d.time}`)).toEqual([
      '2026-12-01 07:00', '2026-12-03 18:00', '2026-12-08 07:00', '2026-12-10 18:00', '2026-12-15 07:00', '2026-12-17 18:00',
    ]);
    expect(patternPreview([], '2026-11-30')).toEqual([]);
  });
});

describe('open times demo', () => {
  const day = OPEN_TIMES_DAY;
  const clock = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

  it('is valid, and points only at drawn lanes', () => {
    const script = AVAILABILITY_DEMOS['open-times'];
    expect(demoProblems(script)).toEqual([]);
    for (const frame of script.frames) {
      const lane = frame.pointer?.target.startsWith('lane:') ? frame.pointer.target.slice(5) : null;
      if (lane && lane !== 'open') expect(frame.state.lanes as string[]).toContain(lane);
    }
  });

  it('works out open times as the database does', () => {
    expect(dayWindows(day).map((w) => `${clock(w.from)}-${clock(w.to)}`)).toEqual(['9:00-12:00', '13:00-15:00', '16:00-18:00']);
    expect(dayOpenTimes(day).map(clock)).toEqual(['9:30', '9:45', '13:00', '13:15', '13:30', '13:45', '14:00', '16:00', '16:15', '16:30', '16:45', '17:00']);
  });

  it('marks start times that all fit in the Open lane the picture draws', () => {
    const last = AVAILABILITY_DEMOS['open-times'].frames.at(-1)!.state;
    expect(last.starts).toEqual(dayOpenTimes(day));
    for (const s of last.starts!) expect(last.open.some((w) => w.from <= s && s + day.length <= w.to), clock(s)).toBe(true);
  });

  it('lets time off win over extra hours, and keeps the gap around meetings', () => {
    expect(dayWindows({ hours: [], extra: [{ from: 600, to: 720 }], timeOff: [{ from: 660, to: 690 }] })).toEqual([{ from: 600, to: 660 }, { from: 690, to: 720 }]);
    const tight = { ...day, meetings: [{ from: 600, to: 660, label: 'x' }], gap: 30, earliest: 0, timeOff: [], extra: [], hours: [{ from: 540, to: 720 }] };
    expect(dayOpenTimes(tight).map(clock)).toEqual([]);
    expect(dayOpenTimes({ ...tight, gap: 0 }).map(clock)).toEqual(['9:00', '11:00']);
  });
});

describe('billing demo', () => {
  it('is valid', () => {
    expect(demoProblems(BILLING_DEMOS['payment-oldest-first'])).toEqual([]);
  });

  it('pays the oldest charges first and keeps the rest as credit', () => {
    // October's programming (Oct 1) comes before October's session (Oct 27).
    const { charges, creditCents } = applyCredit(BILLING_DEMO_CHARGES, 35000);
    expect(charges.map((c) => `${c.id} ${c.status} ${c.paidCents}`)).toEqual(['oct-session part_paid 5000', 'oct paid 30000', 'nov unpaid 0']);
    expect(creditCents).toBe(0);
    expect(applyCredit(BILLING_DEMO_CHARGES, 75000).creditCents).toBe(5000);
  });

  it('shows the balance the captions describe', () => {
    const frames = BILLING_DEMOS['payment-oldest-first'].frames;
    const summary = (i: number) => demoSummary(frames[i]!.state.charges, frames[i]!.state.creditCents);
    // It opens faded, on the last loop's end then the start, before showing the start.
    expect(frames.slice(0, 2).map((f) => f.state.faded)).toEqual([true, true]);
    expect(frames.at(-1)!.state.faded).toBeUndefined();
    const first = frames.findIndex((f) => !f.state.faded);
    expect(summary(first)).toMatchObject({ balanceCents: 70000, carriedOverCents: 40000 });
    const credit = frames.findIndex((f) => f.caption.includes('credit') && f.state.creditCents > 0);
    expect(summary(credit).balanceCents).toBe(-5000);
    const last = frames.at(-1)!.state;
    expect(summary(frames.length - 1).balanceCents).toBe(5000);
    expect(last.charges.find((c) => c.id === NEXT_SESSION.id)).toMatchObject({ paidCents: 5000, status: 'part_paid' });
    // Each month's statement, from the panel's own grouping.
    expect(statements(last.charges).map((s) => `${s.period} ${s.status}`)).toEqual(['2026-11-01 part_paid', '2026-10-01 paid']);
  });
});
