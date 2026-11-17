/**
 * Demo mesocycles (fictional clients). Structure, naming and progression follow
 * samples/Mesocycle Sample: a 6-day legs/pull/push split, machine- and seat-specific exercise
 * names, "X or Y" rows as one slot with an alternative, RIR targets that start at 2 on primary
 * rows and 1 on accessories, and volume added in sets week to week.
 */
import type { ProgramDraft } from '@/domain/programs/contract';
import { advancedProgression, bodyweight, introProgression, mesocycle, resource, type MesoDay } from './builders';

/** The sample's "Additional Resources" sheet, rewritten as readable reference text. */
const feedbackGuide = (key: string) => [
  resource(key, 'Session feedback (0–3)', [
    'Score each target muscle after the session.',
    '',
    'Challenge: how much did the session challenge your target muscles?',
    '0 — barely aware of the target muscles · 1 — they worked, but mildly · 2 — a good amount of tension or burn · 3 — tension and burn close to the limit',
    '',
    'Pump: 0 — none · 1 — very mild · 2 — decent · 3 — close to maximal',
    '',
    'Disruption: 0 — no fatigue or soreness · 1 — weak and stiff after, recovered by the next day · 2 — weak and stiff after, some soreness the next day · 3 — much weaker right after, sore for a few days or more',
    '',
    'Soreness: 0 — not sore · 1 — stiff for a few hours, resolved by the next session for that muscle · 2 — DOMS that recovered just in time · 3 — DOMS still there at the next session',
    '',
    'Performance: 0 — hit target reps with 2+ reps to spare · 1 — hit target reps with 0–1 reps to spare · 2 — hit target reps only after target RIR · 3 — could not match last week\'s reps at any RIR',
  ].join('\n')),
  resource(key, 'Set progression', [
    'Stimulus (challenge + pump + disruption, 0–9) and soreness decide next week\'s sets for that muscle.',
    '',
    'Stimulus 0–3: increase volume by two to four sets · 4–6: progress normally · 7–9: drop volume the following week.',
    '',
    'Soreness 0: add 1–3 sets (low stimulus), 0–2 (moderate), none (high).',
    'Soreness 1: add 1–2 sets (low stimulus), 0–1 (moderate), none (high).',
    'Soreness 2 or 3: do not add sets; prioritise recovery.',
  ].join('\n')),
];

const mayaDays: MesoDay[] = [
  {
    focus: 'Legs',
    exercises: [
      { name: 'Silver Leg Press', tier: 'primary', sets: 3, reps: [8, 12], alternatives: ['Smith Machine Squat'], notes: 'Feet mid-platform, shoulder width.' },
      { name: '2/3 Bottom Depth Squat', tier: 'primary', sets: 3, reps: [10, 15], notes: 'Dumbbell held at the chest. Stay in the bottom two thirds.' },
      { name: 'Single Leg Hip Thrust', tier: 'primary', sets: 2, reps: [10, 15], perSide: true },
      { name: 'Assisted Hamstring Extension', tier: 'primary', sets: 2, reps: [6, 10] },
      { name: 'Lying Hamstring Curl', tier: 'primary', sets: 3, reps: [10, 15] },
      { name: 'Seated Calf Raise', tier: 'accessory', sets: 3, reps: [10, 15], alternatives: ['Machine Calf Raises'], notes: 'Two-second pause in the stretch.' },
      { name: 'Red Machine Shoulder Press', tier: 'accessory', sets: 2, reps: [8, 12] },
    ],
  },
  {
    focus: 'Pull',
    exercises: [
      { name: 'Cable Row', tier: 'primary', sets: 3, reps: [8, 12] },
      { name: 'Assisted Chinup', tier: 'primary', sets: 3, reps: [6, 10], notes: 'Reduce assistance before adding reps.' },
      { name: 'Cable Lat Pullover', tier: 'primary', sets: 2, reps: [12, 15] },
      { name: 'Dumbbell Bent High Row', tier: 'accessory', sets: 2, reps: [10, 15] },
      { name: 'Dumbbell Rear Delt Fly', tier: 'accessory', sets: 3, reps: [12, 20] },
      { name: 'Incline Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
      { name: 'Machine Curl', tier: 'accessory', sets: 2, reps: [10, 15], dropSetFrom: 3 },
      { name: 'Seated Calf Raise', tier: 'accessory', sets: 3, reps: [10, 15], alternatives: ['Machine Calf Raises'] },
    ],
  },
  {
    focus: 'Push',
    exercises: [
      { name: 'Plate Incline Press (4 seat)', tier: 'primary', sets: 3, reps: [8, 12] },
      { name: 'Machine Press Red (6 seat)', tier: 'primary', sets: 3, reps: [8, 12] },
      { name: 'Machine Chest Fly', tier: 'primary', sets: 2, reps: [12, 15], alternatives: ['Cable Chest Fly'] },
      { name: 'Barbell Skullcrusher', tier: 'accessory', sets: 2, reps: [10, 12] },
      { name: 'Cable Rope Tricep Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
      { name: 'Cable Overhead Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
      { name: 'Wall Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 20], dropSetFrom: 3 },
    ],
  },
  {
    focus: 'Legs',
    exercises: [
      { name: 'Leg Extension', tier: 'primary', sets: 3, reps: [10, 15] },
      { name: 'Elevated Reverse Lunge', tier: 'accessory', sets: 2, reps: [8, 12], perSide: true },
      { name: 'Seated Hamstring Curl', tier: 'primary', sets: 3, reps: [10, 15] },
      { name: 'Assisted Hamstring Extension', tier: 'primary', sets: 2, reps: [6, 10] },
      { name: 'Seated Calf Raise', tier: 'primary', sets: 3, reps: [10, 15], alternatives: ['Machine Calf Raises'] },
      { name: 'Wall Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 20] },
    ],
  },
  {
    focus: 'Pull',
    exercises: [
      { name: 'Machine Row (Red, 5 seat)', tier: 'primary', sets: 3, reps: [8, 12] },
      { name: 'Plate Single Arm Row', tier: 'primary', sets: 2, reps: [10, 12], perSide: true },
      { name: 'Plate Pulldown', tier: 'accessory', sets: 3, reps: [8, 12] },
      { name: 'Dumbbell Bent High Row', tier: 'primary', sets: 2, reps: [10, 15] },
      { name: 'Dumbbell Rear Delt Fly', tier: 'primary', sets: 2, reps: [12, 20] },
      { name: 'Machine Curl', tier: 'accessory', sets: 2, reps: [10, 15] },
      { name: 'Dumbbell Hammer Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
      { name: 'Seated Wrist Extension', tier: 'accessory', sets: 2, reps: [15, 20] },
    ],
  },
  {
    focus: 'Push',
    exercises: [
      { name: 'Dumbbell Incline Press', tier: 'primary', sets: 3, reps: [8, 12] },
      { name: 'Cable Chest Fly', tier: 'primary', sets: 2, reps: [12, 15] },
      { name: 'Incline Pushup', tier: 'accessory', sets: 2, reps: [12, 20], load: bodyweight },
      { name: 'Rope Facepull (Chin)', tier: 'primary', sets: 2, reps: [12, 15] },
      { name: 'Leaning Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 15], perSide: true },
      { name: 'Cable Rope Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
      { name: 'Machine Skullcrusher', tier: 'accessory', sets: 2, reps: [10, 12] },
      { name: 'Assisted Dip', tier: 'primary', sets: 2, reps: [8, 12] },
    ],
  },
];

const mayaNotes = [
  'Mesocycle 3 updates: the goal of this mesocycle is to build on the RIR practice from Mesocycles 1 and 2. Week-to-week progression is autoregulated: volume increases in sets as well as reps, weight and RIR.',
  '',
  'Progression is assessed each week through your session feedback scores. It continues until fatigue is high, RIR estimates are low and an adequate stimulus has been presented. Week 5 is a deload. The numbers tracked here carry into the next mesocycle.',
].join('\n');

export const mayaMesocycle: ProgramDraft = mesocycle({
  key: 'maya/meso3',
  title: 'Hypertrophy Mesocycle',
  theme: 'Balanced',
  coachNotes: mayaNotes,
  startDate: '2026-11-02',
  weeks: 5,
  progression: advancedProgression,
  days: mayaDays,
  resources: feedbackGuide('maya/meso3'),
});

/**
 * Revision 2, still a draft: week 2 feedback showed low side-delt stimulus and elbow discomfort on
 * the barbell skullcrusher. Weeks 3–4 get an extra lateral-raise set; weeks 3–5 swap the machine in.
 * Node ids are kept, as an editor opening the published revision would.
 */
export const mayaMesocycleRevision: ProgramDraft = (() => {
  const draft = structuredClone(mayaMesocycle);
  draft.coachNotes += '\n\nWeek 3 changes: one more set on both lateral raise slots after low side-delt scores, and Machine Skullcrusher replaces Barbell Skullcrusher on the first Push day for the elbow.';
  for (const week of draft.weeks.slice(2, 4)) {
    for (const day of week.days) {
      for (const ex of day.sections[0]!.exercises) {
        if (ex.name === 'Wall Lateral Raise' || ex.name === 'Leaning Lateral Raise') {
          const sets = ex.prescription.setCount!.max + 1;
          ex.prescription.setCount = { min: sets, max: sets };
          const [first] = ex.prescription.targets;
          if (ex.prescription.targets.length > 1) ex.prescription.targets = [...Array.from({ length: sets - 1 }, () => ({ ...first!, annotations: [] })), ex.prescription.targets.at(-1)!];
        }
      }
    }
  }
  for (const week of draft.weeks.slice(2)) {
    const skull = week.days[2]!.sections[0]!.exercises.find((ex) => ex.name === 'Barbell Skullcrusher')!;
    skull.name = 'Machine Skullcrusher';
    skull.logicalKey = 'machine-skullcrusher';
    skull.notes = 'Swapped from the barbell version for elbow comfort.';
  }
  return draft;
})();

export const graceMesocycle: ProgramDraft = mesocycle({
  key: 'grace/meso1',
  title: 'Hypertrophy Mesocycle',
  theme: 'Lower body emphasis',
  coachNotes: [
    'Four-day upper/lower split with two lower days built around glutes and hamstrings. Upper days hold volume steady while lower days add sets each week.',
    '',
    'Log every set and fill in session feedback after each workout. Week 5 is a deload: half the sets, well away from failure.',
  ].join('\n'),
  startDate: '2026-10-19',
  weeks: 5,
  progression: advancedProgression,
  resources: feedbackGuide('grace/meso1'),
  days: [
    {
      focus: 'Lower · Glutes',
      exercises: [
        { name: 'Machine Hip Thrust', tier: 'primary', sets: 3, reps: [8, 12], notes: 'One-second squeeze at the top.' },
        { name: 'Smith Machine Squat', tier: 'primary', sets: 3, reps: [8, 12], alternatives: ['Hack Squat'], notes: 'Feet slightly forward.' },
        { name: '45° Back Extension', tier: 'primary', sets: 2, reps: [12, 15], notes: 'Round the upper back and drive with the glutes.' },
        { name: 'Cable Glute Kickback', tier: 'accessory', sets: 2, reps: [12, 15], perSide: true },
        { name: 'Seated Hip Abduction', tier: 'accessory', sets: 3, reps: [15, 20], dropSetFrom: 3 },
        { name: 'Seated Calf Raise', tier: 'accessory', sets: 3, reps: [10, 15] },
      ],
    },
    {
      focus: 'Upper',
      exercises: [
        { name: 'Machine Chest Press', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Neutral Grip Pulldown', tier: 'primary', sets: 3, reps: [10, 12] },
        { name: 'Chest Supported Row', tier: 'primary', sets: 3, reps: [10, 12] },
        { name: 'Dumbbell Shoulder Press', tier: 'primary', sets: 2, reps: [8, 12] },
        { name: 'Cable Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 15], perSide: true },
        { name: 'EZ Bar Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
        { name: 'Rope Pushdown', tier: 'accessory', sets: 2, reps: [12, 15] },
      ],
    },
    {
      focus: 'Lower · Hamstrings',
      exercises: [
        { name: 'Dumbbell Romanian Deadlift', tier: 'primary', sets: 3, reps: [8, 10], notes: 'Three-second lowering; stop when the hips stop moving back.' },
        { name: 'Bulgarian Split Squat', tier: 'primary', sets: 3, reps: [8, 12], perSide: true, notes: 'Lean forward slightly to bias the glutes.' },
        { name: 'Seated Hamstring Curl', tier: 'primary', sets: 3, reps: [10, 15] },
        { name: 'Leg Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
        { name: 'Cable Pull-Through', tier: 'accessory', sets: 2, reps: [12, 15] },
        { name: 'Hanging Knee Raise', tier: 'accessory', sets: 2, reps: [10, 15], load: bodyweight },
      ],
    },
    {
      focus: 'Upper',
      exercises: [
        { name: 'Dumbbell Incline Press', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Single Arm Cable Row', tier: 'primary', sets: 3, reps: [10, 12], perSide: true },
        { name: 'Assisted Pull-up', tier: 'primary', sets: 3, reps: [6, 10] },
        { name: 'Pec Deck', tier: 'accessory', sets: 2, reps: [12, 15] },
        { name: 'Reverse Pec Deck', tier: 'accessory', sets: 2, reps: [15, 20] },
        { name: 'Dumbbell Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 20], dropSetFrom: 3 },
        { name: 'Cable Overhead Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
      ],
    },
  ],
});

/** Ended 2026-05-31; the service and its history stay for reference. */
export const hannahMesocycle: ProgramDraft = mesocycle({
  key: 'hannah/meso2',
  title: 'Hypertrophy Mesocycle',
  theme: 'Full body foundations',
  coachNotes: 'Three full-body sessions a week with at least one rest day between them. This block practises judging RIR honestly: stop each set when you think you have the listed reps left. Week 4 is a deload.',
  startDate: '2026-05-04',
  weeks: 4,
  progression: introProgression,
  resources: feedbackGuide('hannah/meso2'),
  days: [
    {
      focus: 'Full Body A',
      exercises: [
        { name: 'Goblet Squat', tier: 'primary', sets: 3, reps: [10, 12] },
        { name: 'Dumbbell Bench Press', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Lat Pulldown', tier: 'primary', sets: 3, reps: [10, 12] },
        { name: 'Dumbbell Romanian Deadlift', tier: 'primary', sets: 2, reps: [10, 12] },
        { name: 'Cable Lateral Raise', tier: 'accessory', sets: 2, reps: [12, 15], perSide: true },
        { name: 'Cable Crunch', tier: 'accessory', sets: 2, reps: [12, 15] },
      ],
    },
    {
      focus: 'Full Body B',
      exercises: [
        { name: 'Leg Press', tier: 'primary', sets: 3, reps: [10, 15] },
        { name: 'Seated Cable Row', tier: 'primary', sets: 3, reps: [10, 12] },
        { name: 'Machine Shoulder Press', tier: 'primary', sets: 2, reps: [8, 12] },
        { name: 'Lying Hamstring Curl', tier: 'accessory', sets: 2, reps: [10, 15] },
        { name: 'Dumbbell Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
        { name: 'Cable Pushdown', tier: 'accessory', sets: 2, reps: [12, 15] },
      ],
    },
    {
      focus: 'Full Body C',
      exercises: [
        { name: 'Barbell Hip Thrust', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Incline Machine Press', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Chest Supported Row', tier: 'primary', sets: 3, reps: [10, 12] },
        { name: 'Walking Lunge', tier: 'accessory', sets: 2, reps: [10, 12], perSide: true },
        { name: 'Rope Facepull', tier: 'accessory', sets: 2, reps: [15, 20] },
        { name: 'Seated Calf Raise', tier: 'accessory', sets: 2, reps: [12, 15] },
      ],
    },
  ],
});

/**
 * Lucas hasn't accepted his invitation yet. Matt has built week 1 of a five-day split and is
 * still writing the Legs day, so the draft is deliberately not ready to publish.
 */
export const lucasMesocycleDraft: ProgramDraft = mesocycle({
  key: 'lucas/meso1',
  title: 'Hypertrophy Mesocycle',
  theme: 'Upper body emphasis',
  coachNotes: 'First mesocycle. Five days: upper, lower, then push/pull/legs. Week 1 is written; weeks 2–5 will be duplicated from it once the Legs day is finished.',
  startDate: '2026-11-23',
  weeks: 5,
  builtWeeks: 1,
  progression: introProgression,
  resources: feedbackGuide('lucas/meso1'),
  days: [
    {
      focus: 'Upper',
      exercises: [
        { name: 'Barbell Bench Press', tier: 'primary', sets: 3, reps: [6, 10] },
        { name: 'Chest Supported T-Bar Row', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Seated Dumbbell Shoulder Press', tier: 'primary', sets: 2, reps: [8, 12] },
        { name: 'Wide Grip Pulldown', tier: 'primary', sets: 2, reps: [10, 12] },
        { name: 'Cable Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 15], perSide: true },
        { name: 'Preacher Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
        { name: 'Overhead Rope Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
      ],
    },
    {
      focus: 'Lower',
      exercises: [
        { name: 'Hack Squat', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Barbell Romanian Deadlift', tier: 'primary', sets: 3, reps: [8, 10] },
        { name: 'Leg Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
        { name: 'Seated Hamstring Curl', tier: 'accessory', sets: 2, reps: [10, 15] },
        { name: 'Standing Calf Raise', tier: 'accessory', sets: 3, reps: [10, 15] },
      ],
    },
    {
      focus: 'Push',
      exercises: [
        { name: 'Incline Smith Press', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Machine Shoulder Press', tier: 'primary', sets: 2, reps: [8, 12] },
        { name: 'Cable Chest Fly', tier: 'accessory', sets: 2, reps: [12, 15], alternatives: ['Pec Deck'] },
        { name: 'Dumbbell Lateral Raise', tier: 'accessory', sets: 3, reps: [12, 20] },
        { name: 'Cable Rope Tricep Extension', tier: 'accessory', sets: 2, reps: [12, 15] },
        { name: 'Assisted Dip', tier: 'primary', sets: 2, reps: [8, 12] },
      ],
    },
    {
      focus: 'Pull',
      exercises: [
        { name: 'Assisted Chinup', tier: 'primary', sets: 3, reps: [6, 10] },
        { name: 'Machine Row', tier: 'primary', sets: 3, reps: [8, 12] },
        { name: 'Cable Lat Pullover', tier: 'accessory', sets: 2, reps: [12, 15] },
        { name: 'Reverse Pec Deck', tier: 'accessory', sets: 3, reps: [15, 20] },
        { name: 'Incline Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
        { name: 'Dumbbell Hammer Curl', tier: 'accessory', sets: 2, reps: [10, 12] },
      ],
    },
    {
      focus: 'Legs',
      exercises: [
        { name: 'Silver Leg Press', tier: 'primary', sets: 3, reps: [10, 15], alternatives: ['Smith Machine Squat'] },
        { name: 'Lying Hamstring Curl', tier: 'primary', sets: 3, reps: [10, 15] },
        { name: 'Elevated Reverse Lunge', tier: 'accessory', sets: 2, reps: [8, 12], perSide: true },
        { name: 'Seated Calf Raise', unfinished: true },
        { name: 'Cable Crunch', unfinished: true },
      ],
    },
  ],
});
