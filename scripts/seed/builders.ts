/**
 * Compact builders for the local demo programs (supabase/seed/programs.sql). They expand a short
 * description into full ProgramDraft documents with deterministic ids, so regenerating the seed
 * gives the same file and the same URLs after every `pnpm db:reset`.
 */
import { createHash } from 'node:crypto';
import type { Load } from '@/domain/measurements/load';
import type { NumericRange } from '@/domain/measurements/range';
import type { Exercise, ProgramDraft, ProgramWeek, Section, SetTarget, WorkoutDay } from '@/domain/programs/contract';
import { slug } from '@/domain/imports/notation';

/** UUID-shaped id derived from a stable path (version nibble 5, RFC 4122 variant). */
export function seedId(path: string): string {
  const h = createHash('sha1').update(`mps-seed:${path}`).digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const range = (min: number, max = min): NumericRange => ({ min, max });
export const lb = (min: number, max = min): Load => ({ mode: 'external', value: range(min, max), unit: 'lb' });
export const band = (label: string): Load => ({ mode: 'band', label });
export const bodyweight: Load = { mode: 'bodyweight', added: null };
export const noLoad: Load = { mode: 'not_applicable' };

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Shared by both services: one exercise row with a set count and one or more set targets. */
type ExerciseSpec = {
  name: string;
  alternatives?: string[];
  group?: string;
  notes?: string;
  muscles?: string[];
  setCount: NumericRange | null;
  targets: SetTarget[];
};

function exercise(path: string, spec: ExerciseSpec): Exercise {
  return {
    id: seedId(path),
    logicalKey: slug(spec.name),
    name: spec.name,
    alternatives: (spec.alternatives ?? []).map((name) => ({ id: seedId(`${path}/alt/${name}`), name })),
    groupId: spec.group ?? null,
    demoUrl: null,
    muscles: spec.muscles ?? [],
    prescription: { setCount: spec.setCount, targets: spec.targets },
    notes: spec.notes ?? '',
  };
}

// ---------------------------------------------------------------------------------------------
// Mesocycles. Mirrors samples/Mesocycle Sample: each row prescribes reps and RIR only. Loads are
// what the client logs, so they are never written as targets (prescriptions ≠ results).
// ---------------------------------------------------------------------------------------------

/**
 * Muscle groups for the demo mesocycles' set totals (decision 0021). Names follow the sample's
 * Weekly Set Totals list. Compound rows list each muscle they count toward.
 */
const MESO_MUSCLES: Record<string, string[]> = {
  'Silver Leg Press': ['Quads', 'Glutes'], '2/3 Bottom Depth Squat': ['Quads'], 'Single Leg Hip Thrust': ['Glutes'],
  'Assisted Hamstring Extension': ['Hamstrings'], 'Lying Hamstring Curl': ['Hamstrings'], 'Seated Calf Raise': ['Calves'],
  'Red Machine Shoulder Press': ['Front Delts'], 'Cable Row': ['Back'], 'Assisted Chinup': ['Back', 'Biceps'],
  'Cable Lat Pullover': ['Back'], 'Dumbbell Bent High Row': ['Back', 'Rear Delts'], 'Dumbbell Rear Delt Fly': ['Rear Delts'],
  'Incline Curl': ['Biceps'], 'Machine Curl': ['Biceps'], 'Plate Incline Press (4 seat)': ['Chest', 'Front Delts'],
  'Machine Press Red (6 seat)': ['Chest'], 'Machine Chest Fly': ['Chest'], 'Barbell Skullcrusher': ['Triceps'],
  'Cable Rope Tricep Extension': ['Triceps'], 'Cable Overhead Extension': ['Triceps'], 'Wall Lateral Raise': ['Middle Delts'],
  'Leg Extension': ['Quads'], 'Elevated Reverse Lunge': ['Quads', 'Glutes'], 'Seated Hamstring Curl': ['Hamstrings'],
  'Machine Row (Red, 5 seat)': ['Back'], 'Plate Single Arm Row': ['Back'], 'Plate Pulldown': ['Back', 'Biceps'],
  'Dumbbell Hammer Curl': ['Biceps', 'Forearms'], 'Seated Wrist Extension': ['Forearms'], 'Dumbbell Incline Press': ['Chest', 'Front Delts'],
  'Cable Chest Fly': ['Chest'], 'Incline Pushup': ['Chest', 'Triceps'], 'Rope Facepull (Chin)': ['Rear Delts'],
  'Leaning Lateral Raise': ['Middle Delts'], 'Cable Rope Extension': ['Triceps'], 'Machine Skullcrusher': ['Triceps'],
  'Assisted Dip': ['Chest', 'Triceps'], 'Machine Hip Thrust': ['Glutes'], 'Smith Machine Squat': ['Quads', 'Glutes'],
  '45° Back Extension': ['Glutes', 'Hamstrings'], 'Cable Glute Kickback': ['Glutes'], 'Seated Hip Abduction': ['Glutes'],
  'Machine Chest Press': ['Chest'], 'Neutral Grip Pulldown': ['Back'], 'Chest Supported Row': ['Back'],
  'Dumbbell Shoulder Press': ['Front Delts'], 'Cable Lateral Raise': ['Middle Delts'], 'EZ Bar Curl': ['Biceps'],
  'Rope Pushdown': ['Triceps'], 'Dumbbell Romanian Deadlift': ['Hamstrings', 'Glutes'], 'Bulgarian Split Squat': ['Quads', 'Glutes'],
  'Cable Pull-Through': ['Glutes'], 'Hanging Knee Raise': ['Abs'], 'Single Arm Cable Row': ['Back'], 'Assisted Pull-up': ['Back', 'Biceps'],
  'Pec Deck': ['Chest'], 'Reverse Pec Deck': ['Rear Delts'], 'Dumbbell Lateral Raise': ['Middle Delts'],
  'Goblet Squat': ['Quads', 'Glutes'], 'Dumbbell Bench Press': ['Chest'], 'Lat Pulldown': ['Back'], 'Cable Crunch': ['Abs'],
  'Leg Press': ['Quads', 'Glutes'], 'Seated Cable Row': ['Back'], 'Machine Shoulder Press': ['Front Delts'],
  'Barbell Hip Thrust': ['Glutes'], 'Incline Machine Press': ['Chest', 'Front Delts'], 'Walking Lunge': ['Quads', 'Glutes'],
  'Rope Facepull': ['Rear Delts'], 'Barbell Bench Press': ['Chest', 'Triceps'], 'Chest Supported T-Bar Row': ['Back'],
  'Seated Dumbbell Shoulder Press': ['Front Delts'], 'Wide Grip Pulldown': ['Back'], 'Preacher Curl': ['Biceps'],
  'Overhead Rope Extension': ['Triceps'], 'Hack Squat': ['Quads', 'Glutes'], 'Barbell Romanian Deadlift': ['Hamstrings', 'Glutes'],
  'Standing Calf Raise': ['Calves'], 'Incline Smith Press': ['Chest', 'Front Delts'], 'Machine Row': ['Back'],
};

/** primary = the compound/first slots the sample gives a higher RIR; accessory = isolation work. */
export type MesoTier = 'primary' | 'accessory';

export type MesoExercise = {
  name: string;
  tier: MesoTier;
  /** Week 1 working sets; later weeks add sets per the progression. */
  sets: number;
  reps: [number, number];
  perSide?: boolean;
  load?: Load;
  alternatives?: string[];
  notes?: string;
  /** Last set becomes a drop set from this week (1-based) until the deload. */
  dropSetFrom?: number;
};

/** Still being written: named, but no set count or target yet (drafts only). */
export type UnfinishedExercise = { name: string; unfinished: true };

export type MesoDay = { focus: string; exercises: (MesoExercise | UnfinishedExercise)[] };

export type MesoProgression = {
  /** RIR per accumulation week, [primary, accessory]. The final week is a deload. */
  rir: [NumericRange, NumericRange][];
  deloadRir: NumericRange;
  /** Sets added to the week-1 count in each accumulation week. */
  addSets: Record<MesoTier, number[]>;
};

/** Matches the sample's week 1 (RIR 2 on primary rows, 1 on accessories), then tapers to 0. */
export const advancedProgression: MesoProgression = {
  rir: [
    [range(2), range(1)],
    [range(1, 2), range(1)],
    [range(1), range(0, 1)],
    [range(0, 1), range(0)],
  ],
  deloadRir: range(3, 4),
  addSets: { primary: [0, 0, 1, 1], accessory: [0, 1, 1, 2] },
};

/** Newer lifters start further from failure and add volume more slowly. */
export const introProgression: MesoProgression = {
  rir: [
    [range(3), range(2, 3)],
    [range(2, 3), range(2)],
    [range(2), range(1, 2)],
    [range(1, 2), range(1)],
  ],
  deloadRir: range(3, 4),
  addSets: { primary: [0, 0, 1, 1], accessory: [0, 0, 1, 1] },
};

export type MesoSpec = {
  key: string;
  title: string;
  theme: string;
  coachNotes: string;
  /** Monday of week 1; following weeks start seven days apart. */
  startDate: string;
  /** Total weeks including the deload; fewer than the progression length builds a partial draft. */
  weeks: number;
  /** Weeks to build when the draft is still in progress (defaults to all). */
  builtWeeks?: number;
  progression: MesoProgression;
  days: MesoDay[];
  resources?: ProgramDraft['resources'];
};

export function mesocycle(spec: MesoSpec): ProgramDraft {
  const accumulation = spec.weeks - 1;
  const weeks: ProgramWeek[] = [];
  for (let w = 0; w < (spec.builtWeeks ?? spec.weeks); w++) {
    const deload = w === accumulation;
    const weekPath = `${spec.key}/w${w + 1}`;
    const days: WorkoutDay[] = spec.days.map((day, d) => {
      const dayPath = `${weekPath}/d${d + 1}`;
      const exercises = day.exercises.map((ex, e) => {
        const path = `${dayPath}/e${e + 1}`;
        if ('unfinished' in ex) return exercise(path, { name: ex.name, setCount: null, targets: [] });
        const progressionWeek = Math.min(w, spec.progression.rir.length - 1);
        const [primaryRir, accessoryRir] = spec.progression.rir[progressionWeek]!;
        const sets = deload
          ? Math.max(1, Math.ceil(ex.sets / 2))
          : Math.min(5, ex.sets + (spec.progression.addSets[ex.tier][progressionWeek] ?? 0));
        const target: SetTarget = {
          effort: { kind: 'reps', reps: range(...ex.reps), perSide: ex.perSide ?? false },
          load: ex.load ?? null,
          rir: deload ? spec.progression.deloadRir : ex.tier === 'primary' ? primaryRir : accessoryRir,
          rpe: null,
          annotations: [],
        };
        const dropSet = !deload && ex.dropSetFrom !== undefined && w + 1 >= ex.dropSetFrom;
        const targets = dropSet
          ? Array.from({ length: sets }, (_, i) => (i === sets - 1 ? { ...target, annotations: ['drop set'] } : target))
          : [target];
        return exercise(path, { name: ex.name, alternatives: ex.alternatives, notes: ex.notes, muscles: MESO_MUSCLES[ex.name] ?? [], setCount: range(sets), targets });
      });
      return { id: seedId(dayPath), label: day.focus, scheduledDate: null, sections: [mainSection(dayPath, exercises)] };
    });
    weeks.push({ id: seedId(weekPath), index: w + 1, label: '', startDate: addDays(spec.startDate, 7 * w), useSections: false, days });
  }
  return {
    schemaVersion: 1,
    service: 'mesocycle',
    title: spec.title,
    programTheme: spec.theme,
    sharedSections: [],
    weeks,
    resources: spec.resources ?? [],
    coachNotes: spec.coachNotes,
  };
}

/** With "Use sections" off the title is hidden, but publish still needs one. */
function mainSection(dayPath: string, exercises: Exercise[]): Section {
  return { id: seedId(`${dayPath}/main`), kind: 'main', title: 'Main', instructions: '', exercises };
}

// ---------------------------------------------------------------------------------------------
// Personal training. Mirrors samples/Personal Training Document: shared warm-up and mobility
// circuits, full-body days with explicit lb loads, bands, durations, per-side work and RPE.
// ---------------------------------------------------------------------------------------------

export type PtExercise = {
  name: string;
  sets: number | [number, number];
  /** Reps, a rep range, or one rep target per set (e.g. [12, 10] for two sets). */
  reps?: number | [number, number] | { perSet: number[] };
  seconds?: number;
  perSide?: boolean;
  load?: Load;
  rpe?: number | [number, number];
  alternatives?: string[];
  group?: string;
  notes?: string;
  /** Added to an external lb load in week 2+ (per week). */
  addLb?: number;
};

export type PtSection = { kind: Section['kind']; title: string; instructions?: string; exercises: PtExercise[] };
export type PtDay = { focus: string; exercises: PtExercise[] };

export type PtSpec = {
  key: string;
  title: string;
  coachNotes: string;
  weeks: number;
  startDate: string | null;
  shared: PtSection[];
  days: PtDay[];
  resources?: ProgramDraft['resources'];
};

function ptExercise(path: string, ex: PtExercise, week: number): Exercise {
  const setCount = typeof ex.sets === 'number' ? range(ex.sets) : range(...ex.sets);
  let load = ex.load ?? null;
  if (load?.mode === 'external' && ex.addLb) load = lb(load.value.min + ex.addLb * week, load.value.max + ex.addLb * week);
  const base = (reps: number | [number, number] | undefined): SetTarget => ({
    effort: ex.seconds !== undefined
      ? { kind: 'duration', seconds: range(ex.seconds), perSide: ex.perSide ?? false }
      : reps !== undefined
        ? { kind: 'reps', reps: typeof reps === 'number' ? range(reps) : range(...reps), perSide: ex.perSide ?? false }
        : null,
    load,
    rir: null,
    rpe: ex.rpe === undefined ? null : typeof ex.rpe === 'number' ? range(ex.rpe) : range(...ex.rpe),
    annotations: [],
  });
  const targets = ex.reps !== undefined && typeof ex.reps === 'object' && 'perSet' in ex.reps
    ? ex.reps.perSet.map((r) => base(r))
    : [base(ex.reps as number | [number, number] | undefined)];
  return exercise(path, { name: ex.name, alternatives: ex.alternatives, group: ex.group, notes: ex.notes, setCount, targets });
}

function ptSection(path: string, section: PtSection, week: number): Section {
  return {
    id: seedId(path),
    kind: section.kind,
    title: section.title,
    instructions: section.instructions ?? '',
    exercises: section.exercises.map((ex, e) => ptExercise(`${path}/e${e + 1}`, ex, week)),
  };
}

export function personalTraining(spec: PtSpec): ProgramDraft {
  const weeks: ProgramWeek[] = Array.from({ length: spec.weeks }, (_, w) => {
    const weekPath = `${spec.key}/w${w + 1}`;
    return {
      id: seedId(weekPath),
      index: w + 1,
      label: '',
      startDate: spec.startDate ? addDays(spec.startDate, 7 * w) : null,
      useSections: false,
      days: spec.days.map((day, d) => {
        const dayPath = `${weekPath}/d${d + 1}`;
        return {
          id: seedId(dayPath),
          label: day.focus,
          scheduledDate: null,
          sections: [ptSection(`${dayPath}/main`, { kind: 'main', title: 'Main', exercises: day.exercises }, w)],
        };
      }),
    };
  });
  return {
    schemaVersion: 1,
    service: 'personal_training',
    title: spec.title,
    programTheme: '',
    sharedSections: spec.shared.map((s, i) => ptSection(`${spec.key}/shared${i + 1}`, s, 0)),
    weeks,
    resources: spec.resources ?? [],
    coachNotes: spec.coachNotes,
  };
}

export function resource(key: string, title: string, body: string): ProgramDraft['resources'][number] {
  return { id: seedId(`${key}/resource/${title}`), title, body, url: null };
}
