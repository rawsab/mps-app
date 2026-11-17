import type { HistoricalSession } from '../contract';
import type { ImportAccumulator } from '../builder';
import { fractionToLocalTime, serialToIsoDate } from '../excel';
import { alternativeShape, parseEffort, parseLoad, slug } from '../notation';
import { cellText, norm, type Cell, type Sheet, type Workbook } from '../xlsx';
import { parseRangeText, RIR_REVIEW_CEILING, type NumericRange } from '../../measurements/range';
import type { Exercise, ProgramDraft, ProgramWeek, WorkoutDay } from '../../programs/contract';
import { at, cellId, claimOwnershipAndMetadata, excludeLegacyFormulas, metadataValue, numeric, rowCells } from './common';

export const MESOCYCLE_PROFILE = { id: 'mps-mesocycle', version: '0.1.0' } as const;

const EXERCISE_HEADERS = new Set(['exercise', 'exercises', 'movement']);
const RIR_HEADERS = new Set(['rir goal', 'rir', 'target rir', 'rir target']);
const WEIGHT_HEADERS = new Set(['weight', 'load', 'wt']);
const REPS_HEADERS = new Set(['reps', 'rep']);
const FEEDBACK_HEADING = /stimulus/i;
const SET_LABEL = /^\d+(st|nd|rd|th) set$/i;
const LEGACY_SET_HEADINGS = new Set(['set totals', 'weekly change']);
const FEEDBACK_QUESTIONS: [string, RegExp][] = [
  ['challenge', /challenge/i],
  ['pump', /pump/i],
  ['disruption', /disrupt/i],
  ['soreness', /sore/i],
  ['performance', /performance/i],
];
const SUMMARY_HEADINGS = new Set(['weekly set totals', 'weekly time values']);

type Block = {
  sheet: Sheet;
  headerRow: number;
  titleRow: number | null;
  endRow: number;
  exCol: number;
  rirCol: number;
  pairs: { weightCol: number; repsCol: number; index: number }[];
  unknownCols: number[];
  setAreaEnd: number;
};

function findHeaderRows(sheet: Sheet): number[] {
  const rows = new Set<number>();
  for (const c of sheet.cells) {
    if (!EXERCISE_HEADERS.has(norm(cellText(c)))) continue;
    if (rowCells(sheet, c.row).some((o) => RIR_HEADERS.has(norm(cellText(o))))) rows.add(c.row);
  }
  return [...rows].sort((a, b) => a - b);
}

export function looksLikeMesocycle(wb: Workbook): boolean {
  return wb.sheets.some((s) => findHeaderRows(s).length > 0);
}

function describeBlocks(sheet: Sheet): Block[] {
  const headerRows = findHeaderRows(sheet);
  const blocks: Block[] = [];
  headerRows.forEach((headerRow, i) => {
    const cells = rowCells(sheet, headerRow);
    const exCol = cells.find((c) => EXERCISE_HEADERS.has(norm(cellText(c))))!.col;
    const rirCol = cells.find((c) => RIR_HEADERS.has(norm(cellText(c))))!.col;
    const pairs: Block['pairs'] = [];
    const unknownCols: number[] = [];
    let setAreaEnd = Math.max(exCol, rirCol);
    const right = cells.filter((c) => c.col > exCol).sort((a, b) => a.col - b.col);
    for (let k = 0; k < right.length; k++) {
      const c = right[k]!;
      const t = norm(cellText(c));
      if (c.col === rirCol) continue;
      const next = right[k + 1];
      if (WEIGHT_HEADERS.has(t) && next && next.col === c.col + 1 && REPS_HEADERS.has(norm(cellText(next)))) {
        pairs.push({ weightCol: c.col, repsCol: next.col, index: pairs.length + 1 });
        setAreaEnd = next.col;
        k += 1;
      } else if (pairs.length === 0 || c.col === setAreaEnd + 1) {
        // Inserted columns before or inside the set area (e.g. "Tempo") need a mapping decision.
        unknownCols.push(c.col);
        setAreaEnd = Math.max(setAreaEnd, c.col);
      } else {
        break; // feedback / summary area starts here
      }
    }
    // Columns after the last set pair that are not set pairs are not training inputs.
    while (unknownCols.length && unknownCols[unknownCols.length - 1]! > (pairs.at(-1)?.repsCol ?? rirCol)) {
      unknownCols.pop();
    }
    setAreaEnd = Math.max(rirCol, pairs.at(-1)?.repsCol ?? rirCol, ...unknownCols);

    let titleRow: number | null = null;
    for (let r = headerRow - 1; r >= Math.max(1, headerRow - 3); r--) {
      if (rowCells(sheet, r).some((c) => /^day\s*\d+/i.test(cellText(c)) && Math.abs(c.col - exCol) <= 1)) {
        titleRow = r;
        break;
      }
    }
    blocks.push({ sheet, headerRow, titleRow, endRow: 0, exCol, rirCol, pairs, unknownCols, setAreaEnd });
    if (i > 0) blocks[i - 1]!.endRow = (titleRow ?? headerRow) - 1;
  });
  if (blocks.length) {
    const last = blocks.at(-1)!;
    const summary = sheet.cells.find((c) => c.row > last.headerRow && SUMMARY_HEADINGS.has(norm(cellText(c))));
    const timeRow = sheet.cells.find((c) => c.row > last.headerRow && /^time started/i.test(cellText(c)));
    last.endRow = timeRow ? timeRow.row : (summary?.row ?? Math.max(...sheet.cells.map((c) => c.row)) + 1) - 1;
  }
  return blocks;
}

function weekLabelFor(sheet: Sheet, row: number): Cell | undefined {
  return sheet.cells
    .filter((c) => c.row <= row && /^week\s*\d+$/i.test(cellText(c)))
    .sort((a, b) => b.row - a.row)[0];
}

/** Recovers RIR from a cell. Date-converted values become a review issue with a proposal, never a silent fix. */
function readRir(cell: Cell, wb: Workbook, acc: ImportAccumulator, exerciseName: string): NumericRange | null {
  const id = cellId(cell);
  if (cell.isDate) {
    const iso = serialToIsoDate(Number(cell.value), wb.date1904);
    const [, mo, d] = (iso ?? '').split('-').map(Number);
    const plausible = mo !== undefined && d !== undefined && mo <= d && d <= RIR_REVIEW_CEILING;
    acc.issue(
      'RIR_DATE_CONVERTED',
      'blocking',
      `RIR for "${exerciseName}" is stored as a date (serial ${cell.value}, shown as "${cell.displayText ?? iso}"). Spreadsheet software likely converted a range.`,
      [id],
      plausible ? `RIR range ${mo}-${d}` : null,
    );
    acc.setRole(id, 'prescription');
    return null;
  }
  const parsed = parseRangeText(cell.value ?? '');
  if (parsed.ok && parsed.range.min >= 0) {
    acc.map(id, 'prescription', 'target.rir');
    if (parsed.range.max > RIR_REVIEW_CEILING) {
      acc.issue('RANGE_UNRECOGNIZED', 'warning', `RIR ${cellText(cell)} for "${exerciseName}" is unusually high.`, [id]);
    }
    return parsed.range;
  }
  acc.issue('RANGE_UNRECOGNIZED', 'blocking', `RIR "${cellText(cell)}" for "${exerciseName}" is not a number or range.`, [id]);
  return null;
}

export type MesocycleResult = { program: ProgramDraft; sessions: HistoricalSession[] };

export function parseMesocycle(wb: Workbook, acc: ImportAccumulator): MesocycleResult {
  const meta = claimOwnershipAndMetadata(wb, acc);
  const program: ProgramDraft = {
    schemaVersion: 1,
    service: 'mesocycle',
    title: meta.programStyle ? metadataValue(meta.programStyle) : '',
    sharedSections: [],
    weeks: [],
    resources: [],
    coachNotes: '',
  };
  if (meta.programStyle) acc.map(cellId(meta.programStyle), 'metadata', 'program.title');
  if (meta.programTheme) {
    program.coachNotes = `Program theme: ${metadataValue(meta.programTheme)}`;
    acc.map(cellId(meta.programTheme), 'metadata', 'program.coachNotes');
  }

  const sessions: HistoricalSession[] = [];
  const unitUnknownIds: string[] = [];
  const weeks = new Map<string, ProgramWeek>();

  for (const sheet of wb.sheets) {
    const blocks = describeBlocks(sheet);
    if (!blocks.length) continue;

    for (const block of blocks) {
      const weekCell = weekLabelFor(sheet, block.headerRow);
      const weekKey = weekCell ? cellId(weekCell) : `${sheet.name}:default`;
      let week = weeks.get(weekKey);
      if (!week) {
        const dateText = weekCell ? at(sheet, weekCell.row, weekCell.col + 1) : undefined;
        const index = weeks.size + 1;
        week = {
          id: `w${index}`,
          index,
          label: weekCell ? cellText(weekCell) : /week\s*\d+/i.test(sheet.name) ? sheet.name : `Week ${index}`,
          startDate: null,
          useSections: false,
          days: [],
        };
        if (weekCell) acc.map(cellId(weekCell), 'heading', `weeks.${index - 1}.label`);
        if (dateText && !dateText.isDate && cellText(dateText)) {
          week.label = `${week.label} (${cellText(dateText)})`;
          acc.map(cellId(dateText), 'heading', `weeks.${index - 1}.label`);
          acc.issue(
            'HISTORY_DATE_REQUIRED',
            'warning',
            `${cellText(weekCell!)} is labelled "${cellText(dateText)}" with no year or per-day dates. Historical sessions need confirmed activity dates before history is imported.`,
            [cellId(dateText)],
          );
        }
        weeks.set(weekKey, week);
        program.weeks.push(week);
      }
      const weekIdx = program.weeks.indexOf(week);
      const dayIdx = week.days.length;
      const dayPath = `weeks.${weekIdx}.days.${dayIdx}`;
      const titleCell = block.titleRow ? rowCells(sheet, block.titleRow).find((c) => /^day\s*\d+/i.test(cellText(c))) : undefined;
      const day: WorkoutDay = {
        id: `${week.id}d${dayIdx + 1}`,
        label: titleCell ? cellText(titleCell) : `Day ${dayIdx + 1}`,
        scheduledDate: null,
        sections: [{ id: `${week.id}d${dayIdx + 1}s1`, kind: 'main', title: '', instructions: '', exercises: [] }],
      };
      week.days.push(day);
      if (titleCell) acc.map(cellId(titleCell), 'heading', `${dayPath}.label`);
      const section = day.sections[0]!;

      // Header row cells: known headings are column mappings.
      for (const c of rowCells(sheet, block.headerRow)) {
        if (c.col === block.exCol || c.col === block.rirCol || block.pairs.some((p) => p.weightCol === c.col || p.repsCol === c.col)) {
          acc.map(cellId(c), 'heading', 'column-mapping');
        }
      }
      if (block.titleRow) {
        for (const c of rowCells(sheet, block.titleRow)) {
          const t = norm(cellText(c));
          if (SET_LABEL.test(t)) acc.map(cellId(c), 'heading', 'column-mapping');
          else if (LEGACY_SET_HEADINGS.has(t)) acc.exclude(cellId(c), 'calculated', 'Legacy set-total heading; muscle attribution needs reviewed weights (PRD §10)');
        }
      }
      const timeLabel = sheet.cells.find(
        (c) => c.row > block.headerRow && c.row <= block.endRow && c.col === block.exCol && /^time started/i.test(cellText(c)),
      );
      const lastExerciseRow = timeLabel ? timeLabel.row - 1 : block.endRow;

      for (const col of block.unknownCols) {
        const header = at(sheet, block.headerRow, col);
        const values = sheet.cells.filter((c) => c.col === col && c.row > block.headerRow && c.row <= lastExerciseRow);
        acc.issue(
          'UNRECOGNIZED_CONTENT',
          'blocking',
          `Column "${cellText(header)}" is not part of the mesocycle template. Map it (for example into exercise notes) or exclude it.`,
          [...(header ? [cellId(header)] : []), ...values.map(cellId)],
          'Map to exercise notes',
        );
      }

      const session: HistoricalSession = {
        sourceItemIds: [],
        dayPath,
        activityDate: null,
        startedAtLocalTime: null,
        endedAtLocalTime: null,
        exercises: [],
        feedback: [],
      };

      // Exercise rows
      const exerciseCells = sheet.cells.filter(
        (c) => c.col === block.exCol && c.row > block.headerRow && c.row <= lastExerciseRow && cellText(c) !== '' && c.type !== 'n',
      );
      let pendingAlternative: { exercise: Exercise; cell: Cell } | null = null;
      exerciseCells.forEach((nameCell) => {
        const rawName = cellText(nameCell);
        const shape = alternativeShape(rawName);
        const name = rawName.replace(/\s+or\s*$/i, '').trim();
        const exIdx = section.exercises.length;
        const exPath = `${dayPath}.sections.0.exercises.${exIdx}`;
        const exercise: Exercise = {
          id: `${section.id}e${exIdx + 1}`,
          logicalKey: slug(name),
          name,
          alternatives: [],
          groupId: null,
          demoUrl: null, muscles: [],
          prescription: { setCount: null, targets: [{ effort: null, load: null, rir: null, rpe: null, annotations: [] }] },
          notes: '',
        };
        acc.map(cellId(nameCell), 'prescription', `${exPath}.name`);

        if (pendingAlternative) {
          const groupId = `alt-${pendingAlternative.exercise.id}`;
          pendingAlternative.exercise.groupId = groupId;
          exercise.groupId = groupId;
          acc.issue(
            'EXERCISE_ALTERNATIVE',
            'blocking',
            `"${cellText(pendingAlternative.cell)}" continues onto "${rawName}". Decide whether these are alternatives for one slot or two separate exercises. Both rows contain logged sets.`,
            [cellId(pendingAlternative.cell), cellId(nameCell)],
            `One slot: "${pendingAlternative.exercise.name}" with alternative "${name}"`,
          );
          pendingAlternative = null;
        }
        if (shape === 'continues_next') pendingAlternative = { exercise, cell: nameCell };
        if (shape === 'inline') {
          acc.issue('EXERCISE_ALTERNATIVE', 'warning', `"${rawName}" names a choice of exercises.`, [cellId(nameCell)]);
        }

        const rirCell = at(sheet, nameCell.row, block.rirCol);
        if (rirCell) exercise.prescription.targets[0]!.rir = readRir(rirCell, wb, acc, name);

        const loggedSets: HistoricalSession['exercises'][number]['sets'] = [];
        for (const pair of block.pairs) {
          const wCell = at(sheet, nameCell.row, pair.weightCol);
          const rCell = at(sheet, nameCell.row, pair.repsCol);
          if (!wCell && !rCell) continue;
          const ids = [wCell, rCell].filter((c): c is Cell => !!c).map(cellId);
          const target = `history.sessions[${dayPath}].${exPath}.sets.${pair.index}`;
          const load = parseLoad(wCell ? cellText(wCell) : '');
          const effort = parseEffort(rCell ? cellText(rCell) : '');
          ids.forEach((id) => acc.map(id, 'result', target));
          const annotations: string[] = [];
          if (wCell && !load.recognized) {
            acc.issue('LOAD_UNRECOGNIZED', 'blocking', `Logged load "${cellText(wCell)}" (${exercise.name}, set ${pair.index}) is not recognized.`, [cellId(wCell)]);
          }
          if (load.annotation && wCell) {
            annotations.push(load.annotation);
            const known = /^ds$/i.test(load.annotation);
            acc.issue(
              'LOAD_ANNOTATION',
              'blocking',
              `"${cellText(wCell)}" combines a load with the annotation "${load.annotation}" (${exercise.name}, set ${pair.index}).`,
              [cellId(wCell)],
              known ? `Load ${load.load?.mode === 'external' ? load.load.value.min : ''} with set annotation "drop set"` : null,
            );
          }
          if (load.unitUnknown && wCell) unitUnknownIds.push(cellId(wCell));
          if (rCell && !effort.recognized) {
            acc.issue('RANGE_UNRECOGNIZED', 'blocking', `Logged reps "${cellText(rCell)}" (${exercise.name}, set ${pair.index}) are not recognized.`, [cellId(rCell)]);
          }
          loggedSets.push({
            sourceItemIds: ids,
            setIndex: pair.index,
            load: load.load,
            effort: effort.effort,
            annotations,
            status: load.skipped ? 'skipped' : 'performed',
          });
        }
        if (loggedSets.length) {
          session.exercises.push({ exercisePath: exPath, exerciseName: exercise.name, sets: loggedSets });
          session.sourceItemIds.push(...loggedSets.flatMap((s) => s.sourceItemIds));
        }
        section.exercises.push(exercise);
      });

      // Session start/end times and notes
      if (timeLabel) {
        acc.map(cellId(timeLabel), 'heading', `${dayPath}.session-times`);
        const timeCells = rowCells(sheet, timeLabel.row).filter((c) => c.col > timeLabel.col && numeric(c) !== null && numeric(c)! < 1);
        const [start, end] = timeCells;
        if (start) {
          session.startedAtLocalTime = fractionToLocalTime(numeric(start)!);
          acc.map(cellId(start), 'result', `history.sessions[${dayPath}].startedAt`);
          session.sourceItemIds.push(cellId(start));
        }
        if (end) {
          session.endedAtLocalTime = fractionToLocalTime(numeric(end)!);
          acc.map(cellId(end), 'result', `history.sessions[${dayPath}].endedAt`);
          session.sourceItemIds.push(cellId(end));
        }
        const notes = rowCells(sheet, timeLabel.row).find((c) => /^notes\s*:/i.test(cellText(c)));
        if (notes) {
          const text = cellText(notes).replace(/^notes\s*:\s*/i, '');
          if (text) acc.map(cellId(notes), 'result', `history.sessions[${dayPath}].notes`);
          else acc.exclude(cellId(notes), 'heading', 'Empty "Notes:" label');
        }
      }

      // Optional muscle feedback (FR-08) to the right of the set area
      const feedbackHeading = block.titleRow
        ? rowCells(sheet, block.titleRow).find((c) => c.col > block.setAreaEnd && FEEDBACK_HEADING.test(cellText(c)))
        : undefined;
      const feedbackCol = feedbackHeading?.col ?? Number.POSITIVE_INFINITY;
      if (feedbackHeading && block.titleRow) {
        acc.map(cellId(feedbackHeading), 'heading', `${dayPath}.feedback`);
        const muscles = rowCells(sheet, block.titleRow).filter((c) => c.col > feedbackHeading.col && cellText(c) !== '');
        muscles.forEach((m) => acc.map(cellId(m), 'heading', `${dayPath}.feedback.muscles`));
        const questionCells = sheet.cells.filter(
          (c) => c.col === feedbackHeading.col && c.row > block.titleRow! && c.row <= block.endRow && cellText(c) !== '',
        );
        for (const q of questionCells) {
          const qText = cellText(q);
          const question = FEEDBACK_QUESTIONS.find(([, re]) => re.test(qText));
          if (/^total\s*:?$/i.test(qText)) {
            acc.exclude(cellId(q), 'calculated', 'Legacy feedback total label');
            continue;
          }
          if (!question) {
            if (/assessment/i.test(qText)) acc.map(cellId(q), 'heading', `${dayPath}.feedback`);
            continue;
          }
          acc.map(cellId(q), 'heading', `${dayPath}.feedback.questions`);
          for (const m of muscles) {
            const score = at(sheet, q.row, m.col);
            const value = numeric(score);
            if (!score || value === null || score.formula) continue;
            if (Number.isInteger(value) && value >= 0 && value <= 3) {
              session.feedback.push({ sourceItemIds: [cellId(score)], muscle: cellText(m), question: question[0], score: value });
              acc.map(cellId(score), 'result', `history.sessions[${dayPath}].feedback`);
              session.sourceItemIds.push(cellId(score));
            } else {
              acc.issue('RANGE_UNRECOGNIZED', 'blocking', `Feedback score ${score.value} for ${cellText(m)} is outside the 0–3 scale.`, [cellId(score)]);
            }
          }
        }
      }

      // Legacy per-day set totals / weekly change between the set area and the feedback area
      const firstRow = block.titleRow ?? block.headerRow;
      for (const c of sheet.cells) {
        if (c.row < firstRow || c.row > block.endRow || c.col <= block.setAreaEnd || c.col >= feedbackCol) continue;
        if (!acc.isClaimed(cellId(c))) {
          acc.exclude(cellId(c), 'calculated', 'Legacy muscle set totals / weekly change; attribution needs Matt-reviewed weights (PRD §10)');
        }
      }

      if (session.sourceItemIds.length) sessions.push(session);
    }

    // Coach instructions such as "New Mesocycle Updates:" followed by a text cell
    for (const label of sheet.cells.filter((c) => /updates\s*:?$/i.test(cellText(c)) && !acc.isClaimed(cellId(c)))) {
      const body = rowCells(sheet, label.row).find((c) => c.col > label.col && cellText(c).length > 0);
      acc.map(cellId(label), 'instruction', 'program.coachNotes');
      if (body) {
        program.coachNotes = [program.coachNotes, `${cellText(label)} ${cellText(body)}`].filter(Boolean).join('\n\n');
        acc.map(cellId(body), 'instruction', 'program.coachNotes');
      }
    }

    // Weekly summary region (set totals, time values): legacy calculations and their labels
    const summaryStart = sheet.cells.find((c) => SUMMARY_HEADINGS.has(norm(cellText(c))));
    if (summaryStart) {
      for (const c of sheet.cells) {
        if (c.row >= summaryStart.row && !acc.isClaimed(cellId(c)) && (c.formula || c.type === 'n' || cellText(c).length <= 40)) {
          acc.exclude(cellId(c), 'calculated', 'Legacy weekly summary; the app recalculates reviewed metrics instead');
        }
      }
    }

    // Stray week-level headings for the optional tracking area
    for (const c of sheet.cells) {
      if (!acc.isClaimed(cellId(c)) && /tracking \(optional\)/i.test(cellText(c))) acc.map(cellId(c), 'heading', 'feedback');
    }
  }

  // Sheets without training blocks (e.g. "Additional Resources") become a reviewed text resource.
  for (const sheet of wb.sheets) {
    if (describeBlocks(sheet).length) continue;
    const cells = sheet.cells.filter((c) => !acc.isClaimed(cellId(c)) && !c.formula);
    if (!cells.length) continue;
    const resourceIdx = program.resources.length;
    program.resources.push({
      id: `r${resourceIdx + 1}`,
      title: sheet.name,
      body: cells.map((c) => cellText(c)).join('\n'),
      url: null,
    });
    cells.forEach((c) => acc.map(cellId(c), 'resource', `program.resources.${resourceIdx}`));
  }

  excludeLegacyFormulas(wb, acc);

  if (unitUnknownIds.length) {
    acc.issue(
      'LOAD_UNIT_UNKNOWN',
      'blocking',
      `${unitUnknownIds.length} logged load(s) have no unit. Units are never assumed from a bare number.`,
      unitUnknownIds,
      'Choose lb or kg for this file',
    );
  }
  if (sessions.length) {
    acc.issue(
      'HISTORY_DATE_REQUIRED',
      'warning',
      `${sessions.length} day(s) contain logged results without activity dates. Import program structure only, or supply each session's date.`,
      sessions.flatMap((s) => s.sourceItemIds.slice(0, 1)),
      'Import program structure only',
    );
  }
  return { program, sessions };
}
