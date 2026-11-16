import type { ImportAccumulator } from '../builder';
import type { DocTable, WordDocument } from '../docx';
import { alternativeShape, parseEffort, parseLabelledFields, parseLoad, parseTimedSets, slug } from '../notation';
import { parseRangeText, type NumericRange } from '../../measurements/range';
import type { Exercise, ProgramDraft, Section, SetTarget } from '../../programs/contract';

export const PERSONAL_TRAINING_PROFILE = { id: 'mps-personal-training', version: '0.1.0' } as const;

const COLUMN_SYNONYMS: [keyof Columns, RegExp][] = [
  ['sets', /^sets?$/i],
  ['reps', /^(reps?|time|reps\/time)$/i],
  ['weight', /^(weight|load)$/i],
  ['rpe', /^rpe$/i],
  ['rir', /^rir$/i],
];
type Columns = { sets?: number; reps?: number; weight?: number; rpe?: number; rir?: number };

const cellKey = (t: DocTable, r: number, c: number) => `table${t.index + 1}.r${r + 1}c${c + 1}`;

function sectionKind(title: string): Section['kind'] {
  if (/warm|mobility|activation|prep/i.test(title)) return 'preparation';
  if (/foam|stretch|cool/i.test(title)) return 'cooldown';
  return 'other';
}

function readColumns(table: DocTable): Columns | null {
  const header = table.rows[0];
  if (!header) return null;
  const cols: Columns = {};
  header.cells.forEach((cell, i) => {
    const match = COLUMN_SYNONYMS.find(([, re]) => re.test(cell.text.trim()));
    if (match && cols[match[0]] === undefined) cols[match[0]] = i;
  });
  return cols.sets !== undefined && cols.reps !== undefined ? cols : null;
}

export function looksLikePersonalTraining(doc: WordDocument): boolean {
  return doc.blocks.some((b) => b.kind === 'table' && (readColumns(b) !== null || b.rows.some((r) => /sets\s*:/i.test(r.cells[1]?.text ?? ''))));
}

function emptyTarget(): SetTarget {
  return { effort: null, load: null, rir: null, rpe: null, annotations: [] };
}

export function parsePersonalTraining(doc: WordDocument, acc: ImportAccumulator): ProgramDraft {
  const program: ProgramDraft = {
    schemaVersion: 1,
    service: 'personal_training',
    title: '',
    sharedSections: [],
    weeks: [{ id: 'w1', index: 1, label: 'Week 1', startDate: null, days: [] }],
    resources: [],
    coachNotes: '',
  };
  const week = program.weeks[0]!;
  let lastSection: { section: Section; path: string } | null = null;
  const unitUnknown: string[] = [];

  // Header/footer: name/date lines are metadata, never identity or activity dates.
  doc.headersFooters.forEach((hf) => {
    const id = `${hf.part}.p${hf.paragraph + 1}`;
    acc.register(id, { kind: 'docx_header_footer', part: hf.part, paragraph: hf.paragraph }, { type: 'text', value: hf.text, formula: null, numberFormat: null });
    acc.exclude(id, 'metadata', 'Header/footer identity and document date; destination client and dates are chosen in the app');
  });

  const startSection = (title: string, kind: Section['kind'] | 'day'): { section: Section; path: string } => {
    if (kind === 'day') {
      const dayIdx = week.days.length;
      const section: Section = { id: `w1d${dayIdx + 1}s1`, kind: 'main', title: '', instructions: '', exercises: [] };
      week.days.push({ id: `w1d${dayIdx + 1}`, label: title, scheduledDate: null, sections: [section] });
      return { section, path: `weeks.0.days.${dayIdx}.sections.0` };
    }
    const idx = program.sharedSections.length;
    const section: Section = { id: `shared${idx + 1}`, kind, title, instructions: '', exercises: [] };
    program.sharedSections.push(section);
    return { section, path: `sharedSections.${idx}` };
  };

  const addExercise = (
    current: { section: Section; path: string },
    nameId: string,
    rawName: string,
  ): { exercise: Exercise; path: string } => {
    const name = rawName.replace(/\s+or\s*$/i, '').trim();
    const idx = current.section.exercises.length;
    const exercise: Exercise = {
      id: `${current.section.id}e${idx + 1}`,
      logicalKey: slug(name),
      name,
      alternatives: [],
      groupId: null,
      demoUrl: null,
      prescription: { setCount: null, targets: [emptyTarget()] },
      notes: '',
    };
    current.section.exercises.push(exercise);
    const path = `${current.path}.exercises.${idx}`;
    acc.map(nameId, 'prescription', `${path}.name`);
    const shape = alternativeShape(rawName);
    if (shape) {
      acc.issue(
        'EXERCISE_ALTERNATIVE',
        shape === 'continues_next' ? 'blocking' : 'warning',
        shape === 'continues_next'
          ? `"${rawName}" continues onto the next row. Decide whether the next row is an alternative for this slot.`
          : `"${rawName}" offers a choice of exercises. It stays one slot until alternatives are split in review.`,
        [nameId],
        shape === 'inline' ? `Alternatives: ${rawName.split(/,\s*|\s+or\s+/i).join(' | ')}` : null,
      );
    }
    return { exercise, path };
  };

  const applyLoad = (target: SetTarget, text: string, id: string, exerciseName: string) => {
    const parsed = parseLoad(text);
    if (!parsed.recognized) {
      acc.issue('LOAD_UNRECOGNIZED', 'blocking', `Load "${text}" for ${exerciseName} is not recognized.`, [id]);
      return;
    }
    target.load = parsed.load;
    if (parsed.load?.mode === 'band') {
      acc.issue('BAND_LOAD', 'info', `"${text}" for ${exerciseName} is treated as a band label, not a weight.`, [id]);
    }
    if (parsed.annotation) {
      target.annotations.push(parsed.annotation);
      acc.issue('LOAD_ANNOTATION', 'blocking', `Load "${text}" for ${exerciseName} has an unexplained annotation "${parsed.annotation}".`, [id]);
    }
    if (parsed.unitUnknown) unitUnknown.push(id);
  };

  const applyRange = (text: string, id: string, label: string): NumericRange | null => {
    const t = text.trim();
    if (t === '' || /^-+$/.test(t)) return null;
    const r = parseRangeText(t);
    if (r.ok) return r.range;
    acc.issue('RANGE_UNRECOGNIZED', 'blocking', `${label} "${t}" is not a number or range.`, [id]);
    return null;
  };

  for (const block of doc.blocks) {
    if (block.kind === 'paragraph') {
      const id = `p${block.index + 1}`;
      if (!block.text.trim()) continue;
      acc.register(id, { kind: 'docx_paragraph', paragraph: block.index }, { type: 'text', value: block.text, formula: null, numberFormat: null });
      const note = /^note\s*:\s*(.*)$/is.exec(block.text.trim());
      if (note && lastSection) {
        if (note[1]!.trim()) {
          lastSection.section.instructions = [lastSection.section.instructions, note[1]!.trim()].filter(Boolean).join('\n');
          acc.map(id, 'instruction', `${lastSection.path}.instructions`);
        } else {
          acc.exclude(id, 'heading', 'Empty "Note:" label');
        }
      }
      continue;
    }

    const table = block;
    table.rows.forEach((row, r) =>
      row.cells.forEach((cell, c) => {
        if (cell.text.trim()) {
          acc.register(cellKey(table, r, c), { kind: 'docx_table_cell', table: table.index, row: r, cell: c }, { type: 'text', value: cell.text, formula: null, numberFormat: null });
        }
      }),
    );
    const columns = readColumns(table);

    if (columns) {
      // Five-column workout table: title row carries the day/section name plus column headings.
      const title = table.rows[0]!.cells[0]!.text.trim();
      const current = startSection(title, /^day\s*\d+/i.test(title) ? 'day' : sectionKind(title));
      lastSection = current;
      table.rows[0]!.cells.forEach((cell, c) => cell.text.trim() && acc.map(cellKey(table, 0, c), 'heading', c === 0 ? `${current.path}.title` : 'column-mapping'));
      if (!/^day\s*\d+/i.test(title)) current.section.title = title;

      let pendingAlt: { exercise: Exercise; id: string; name: string } | null = null;
      table.rows.slice(1).forEach((row, i) => {
        const r = i + 1;
        const nameText = row.cells[0]?.text.trim() ?? '';
        if (!nameText) return;
        const { exercise } = addExercise(current, cellKey(table, r, 0), nameText);
        if (pendingAlt) {
          const groupId = `alt-${pendingAlt.exercise.id}`;
          pendingAlt.exercise.groupId = groupId;
          exercise.groupId = groupId;
          pendingAlt = null;
        }
        if (alternativeShape(nameText) === 'continues_next') pendingAlt = { exercise, id: cellKey(table, r, 0), name: nameText };

        const text = (col: number | undefined) => (col === undefined ? '' : (row.cells[col]?.text ?? '').trim());
        const id = (col: number | undefined) => (col === undefined ? '' : cellKey(table, r, col));
        const target = exercise.prescription.targets[0]!;
        const mapIfPresent = (col: number | undefined, field: string) => {
          if (col !== undefined && text(col)) acc.map(id(col), 'prescription', `${exercise.id}.${field}`);
        };
        mapIfPresent(columns.sets, 'setCount');
        mapIfPresent(columns.reps, 'effort');
        mapIfPresent(columns.weight, 'load');
        mapIfPresent(columns.rpe, 'rpe');
        mapIfPresent(columns.rir, 'rir');

        exercise.prescription.setCount = applyRange(text(columns.sets), id(columns.sets), `Sets for ${exercise.name}`);
        const effort = parseEffort(text(columns.reps));
        if (!effort.recognized) {
          acc.issue('RANGE_UNRECOGNIZED', 'blocking', `Reps "${text(columns.reps)}" for ${exercise.name} are not recognized.`, [id(columns.reps)]);
        } else if (effort.perSetReps) {
          // "20, 18": per-set targets or recorded results? Ask rather than guess (FR-15).
          acc.issue(
            'PER_SET_TARGETS_AMBIGUOUS',
            'blocking',
            `Reps "${text(columns.reps)}" for ${exercise.name} list a value per set. Confirm whether these are per-set targets or recorded results.`,
            [id(columns.reps)],
            `Per-set targets: ${effort.perSetReps.map((n, k) => `set ${k + 1} = ${n}`).join(', ')}`,
          );
        } else {
          target.effort = effort.effort;
        }
        if (columns.weight !== undefined && text(columns.weight)) applyLoad(target, text(columns.weight), id(columns.weight), exercise.name);
        if (columns.rpe !== undefined) target.rpe = applyRange(text(columns.rpe), id(columns.rpe), `RPE for ${exercise.name}`);
        if (columns.rir !== undefined) target.rir = applyRange(text(columns.rir), id(columns.rir), `RIR for ${exercise.name}`);
        if (target.rpe && target.rpe.max > 10) {
          acc.issue('RANGE_UNRECOGNIZED', 'blocking', `RPE for ${exercise.name} exceeds 10.`, [id(columns.rpe)]);
          target.rpe = null;
        }

        const sets = exercise.prescription.setCount;
        if (sets && sets.max === 0 && (effort.effort || effort.perSetReps)) {
          acc.issue('SET_COUNT_CONFLICT', 'blocking', `${exercise.name} has 0 sets but a rep target "${text(columns.reps)}".`, [id(columns.sets), id(columns.reps)]);
        }
      });
      continue;
    }

    // Two-column circuit table: single-cell section headings followed by "name | prescription text" rows.
    let current: { section: Section; path: string } | null = null;
    table.rows.forEach((row, r) => {
      const filled = row.cells.filter((c) => c.text.trim());
      if (filled.length === 1 && row.cells[0]?.text.trim()) {
        const title = row.cells[0].text.trim();
        current = startSection(title, sectionKind(title));
        lastSection = current;
        acc.map(cellKey(table, r, 0), 'heading', `${current.path}.title`);
        return;
      }
      if (!current || filled.length < 2) return;
      const name = row.cells[0]!.text.trim();
      const detail = row.cells[1]!.text.trim();
      const detailId = cellKey(table, r, 1);
      const { exercise } = addExercise(current, cellKey(table, r, 0), name);
      const target = exercise.prescription.targets[0]!;
      acc.map(detailId, 'prescription', `${exercise.id}.prescription`);

      const timed = parseTimedSets(detail);
      const fields = timed ? null : parseLabelledFields(detail);
      if (timed) {
        target.effort = timed.effort;
        exercise.prescription.setCount = timed.sets;
      } else if (fields) {
        if (fields.sets) exercise.prescription.setCount = applyRange(fields.sets, detailId, `Sets for ${exercise.name}`);
        if (fields.reps) {
          const effort = parseEffort(fields.reps);
          if (effort.effort) target.effort = effort.effort;
          else acc.issue('RANGE_UNRECOGNIZED', 'blocking', `Reps "${fields.reps}" for ${exercise.name} are not recognized.`, [detailId]);
        }
        if (fields.weight) applyLoad(target, fields.weight, detailId, exercise.name);
        if (fields._leading) {
          acc.issue('UNRECOGNIZED_CONTENT', 'blocking', `Unlabelled text "${fields._leading}" in ${exercise.name}'s prescription.`, [detailId]);
        }
      } else {
        acc.issue('UNRECOGNIZED_CONTENT', 'blocking', `Prescription "${detail}" for ${exercise.name} is not in a recognized format.`, [detailId], 'Keep as exercise notes');
      }
    });
  }

  if (unitUnknown.length) {
    acc.issue('LOAD_UNIT_UNKNOWN', 'blocking', `${unitUnknown.length} load(s) have no unit.`, unitUnknown, 'Choose lb or kg');
  }
  return program;
}
