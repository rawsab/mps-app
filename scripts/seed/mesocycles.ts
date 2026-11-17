/**
 * Demo mesocycles (fictional clients). Structure, naming and progression follow
 * samples/Mesocycle Sample: a 6-day legs/pull/push split, machine- and seat-specific exercise
 * names, "X or Y" rows as one slot with an alternative, RIR targets that start at 2 on primary
 * rows and 1 on accessories, and volume added in sets week to week.
 */
import type { ProgramDraft } from '@/domain/programs/contract';
import { advancedProgression, bodyweight, introProgression, mesocycle, resource, type MesoDay } from './builders';

/** The sample's "Additional Resources" sheet, rewritten as readable reference tables. */
const feedbackGuide = (key: string) => [
  resource(key, 'Session feedback (0–3)', [
    'Score each target muscle after the session.',
    '',
    '## Stimulus Estimation Assessment Tool',
    '| Question | 0 | 1 | 2 | 3 |',
    '|---|---|---|---|---|',
    '| Challenge: how much did the session challenge your target muscles? | Barely aware of the target muscles | They worked, but mildly | A good amount of tension or burn | Tension and burn close to the limit |',
    '| Pump: how much pump did you get in the target muscles? | None | Very mild | Decent | Close to maximal |',
    '| Disruption: how much did the session disrupt your target muscles? | No fatigue or soreness | Weak and stiff after, recovered by the next day | Weak and stiff after, some soreness the next day | Much weaker right after, sore for a few days or more |',
    '',
    '## Set Progression Assessment Tool',
    '| Question | 0 | 1 | 2 | 3 |',
    '|---|---|---|---|---|',
    '| Soreness: how sore did you get in the target muscles? | Not sore | Stiff for a few hours, resolved by the next session for that muscle | DOMS that recovered just in time for the next session | DOMS still there at the next session |',
    '| Performance: how was your performance? | Hit target reps with 2+ reps to spare | Hit target reps with 0–1 reps to spare | Hit target reps only after target RIR | Could not match last week\'s reps at any RIR |',
    '',
    '## Stimulus Score Grading',
    'Stimulus score = challenge + pump + disruption (0–9).',
    '',
    '| Stimulus score | Next week |',
    '|---|---|',
    '| 0–3 | Increase volume by two to four sets |',
    '| 4–6 | Increase volume normally |',
    '| 7–9 | Drop volume |',
  ].join('\n')),
  resource(key, 'Set progression', [
    '## Performance Score matrix',
    'Find your soreness score (row) and performance score (column) for that muscle to see next week\'s sets.',
    '',
    '| Soreness Score \\ Performance Score | 0 | 1 | 2 | 3 |',
    '|---|---|---|---|---|',
    '| 0 | Add 1–3 sets | Add 0–2 sets | Do not add sets | Recovery |',
    '| 1 | Add 1–2 sets | Add 0–1 sets | Do not add sets | Recovery |',
    '| 2 | Do not add sets | Do not add sets | Do not add sets | Recovery |',
    '| 3 | Do not add sets | Do not add sets | Do not add sets | Recovery |',
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
  startDate: '2026-10-29',
  weeks: 5,
  progression: advancedProgression,
  days: mayaDays,
  resources: feedbackGuide('maya/meso3'),
});

/**
 * Revision 2, still a draft: week 2 feedback showed low side-delt stimulus and elbow discomfort on
 * the barbell skullcrusher. Week 4 gets an extra lateral-raise set. Weeks 4–5 swap the machine in.
 * Node ids are kept, as an editor opening the published revision would.
 */
export const mayaMesocycleRevision: ProgramDraft = (() => {
  const draft = structuredClone(mayaMesocycle);
  draft.coachNotes += '\n\nWeek 4 changes: one more set on both lateral raise slots after low side-delt scores, and Machine Skullcrusher replaces Barbell Skullcrusher on the first Push day for the elbow.';
  for (const week of draft.weeks.slice(3, 4)) {
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
  for (const week of draft.weeks.slice(3)) {
    const skull = week.days[2]!.sections[0]!.exercises.find((ex) => ex.name === 'Barbell Skullcrusher')!;
    skull.name = 'Machine Skullcrusher';
    skull.logicalKey = 'machine-skullcrusher';
    skull.notes = 'Swapped from the barbell version for elbow comfort.';
  }
  return draft;
})();

const graceDays: MesoDay[] = [
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
];

export const graceMesocycle: ProgramDraft = mesocycle({
  key: 'grace/meso1',
  title: 'Hypertrophy Mesocycle',
  theme: 'Lower body emphasis',
  coachNotes: [
    'Four-day upper/lower split with two lower days built around glutes and hamstrings. Add sets gradually as recovery allows.',
    '',
    'Log every set and fill in session feedback after each workout. Week 5 is a deload: half the sets, well away from failure.',
  ].join('\n'),
  startDate: '2026-10-23',
  weeks: 5,
  progression: advancedProgression,
  resources: feedbackGuide('grace/meso1'),
  days: graceDays,
});

export const mayaFoundation = mesocycle({
  key: 'maya/meso2',
  title: 'Hypertrophy Base Block',
  theme: 'Balanced',
  coachNotes: 'Four training days. Use consistent machine settings and stop with two to three reps in reserve. Keep Saturday flexible around work.',
  startDate: '2026-10-01',
  weeks: 4,
  progression: introProgression,
  days: mayaDays.slice(0, 4).map(day => ({ ...day, exercises: day.exercises.slice(0, 5) })),
});

export const graceFoundation = mesocycle({
  key: 'grace/base',
  title: 'Lower Body Base Block',
  theme: 'Lower body emphasis',
  coachNotes: 'Build a repeatable squat and hinge before increasing weekly sets. Keep the same setup on the hip thrust every week.',
  startDate: '2026-09-25',
  weeks: 4,
  progression: introProgression,
  days: graceDays.map(day => ({ ...day, exercises: day.exercises.slice(0, 5) })),
});

export const sofiaMesocycle = mesocycle({
  key: 'sofia/base',
  title: 'Two-Day Gym Foundations',
  theme: 'Full body',
  coachNotes: 'Start with two gym sessions per week. Use the same machine setup each time and leave at least two reps in reserve.',
  startDate: '2026-06-02',
  weeks: 2,
  progression: introProgression,
  days: [
    { focus: 'Full Body A', exercises: [
      { name: 'Goblet Squat', tier: 'primary', sets: 2, reps: [8, 12] },
      { name: 'Dumbbell Bench Press', tier: 'primary', sets: 2, reps: [8, 12] },
      { name: 'Lat Pulldown', tier: 'accessory', sets: 2, reps: [10, 12] },
    ] },
    { focus: 'Full Body B', exercises: [
      { name: 'Leg Press', tier: 'primary', sets: 2, reps: [10, 12] },
      { name: 'Seated Cable Row', tier: 'primary', sets: 2, reps: [10, 12] },
      { name: 'Seated Hamstring Curl', tier: 'accessory', sets: 2, reps: [10, 15] },
    ] },
  ],
});
