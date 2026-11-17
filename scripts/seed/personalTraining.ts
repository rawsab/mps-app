/**
 * Demo personal training plans (fictional clients). Layout and notation follow
 * samples/Personal Training Document: a shared warm-up and hip mobility circuit, full-body days,
 * a foam rolling cool-down, explicit lb loads, band colours, timed and per-side work, RPE ranges,
 * and "A, B or C" stretches as one slot with alternatives.
 */
import type { ProgramDraft } from '@/domain/programs/contract';
import { band, bodyweight, lb, noLoad, personalTraining, resource, type PtSection, type PtSpec } from './builders';

const warmUp: PtSection = {
  kind: 'preparation',
  title: 'Warm-Up',
  exercises: [
    { name: 'Side T-Twist', sets: 2, seconds: 30 },
    { name: 'Open Gate', sets: 2, seconds: 30 },
    { name: 'Toe Touches', sets: 2, seconds: 30 },
    { name: 'Hip Hinge', sets: 2, seconds: 30 },
  ],
};

const hipMobility: PtSection = {
  kind: 'preparation',
  title: 'Hip Mobility',
  instructions: 'Perform the hip mobility circuit before the workout and ideally twice per week.',
  exercises: [
    { name: 'Hip Thrust to Clamshell', sets: [1, 2], reps: 15, load: band('Blue') },
    { name: 'Band Standing Lateral Hip Thrust', sets: [1, 2], reps: 15, perSide: true, load: band('Blue') },
    { name: 'Lateral Quad/TFL Foam Rolling', sets: [1, 2], seconds: 60, load: noLoad },
  ],
};

const foamRolling: PtSection = {
  kind: 'cooldown',
  title: 'Foam Rolling Circuit',
  instructions: 'Make sure the muscle you are rolling is relaxed and not flexed.',
  exercises: [
    { name: 'TFL (Side Hip) Foam Roll', sets: 2, seconds: 60, perSide: true, load: noLoad, rpe: [7, 8] },
    { name: 'Hip Flexor (Top Hip) Foam Roll', sets: 2, seconds: 60, perSide: true, load: noLoad, rpe: [7, 8] },
    { name: 'Lateral Quad (Side Thigh) Foam Roll', sets: 2, seconds: 60, perSide: true, load: noLoad, rpe: [7, 8] },
  ],
};

const rpeGuide = (key: string) => [
  resource(key, 'RPE guide', [
    'RPE is how hard the set felt, out of 10.',
    '',
    '## RPE scale',
    '| RPE | Reps left | How it feels |',
    '|---|---|---|',
    '| 10 | 0 | No more reps possible |',
    '| 9 | 1 | One more rep |',
    '| 8 | 2 | Two more reps |',
    '| 7 | 3 | Three more reps, speed still good |',
    '| 6 or below | 4+ | Warm-up effort |',
    '',
    '## Ranges',
    'When a range is listed (for example 8.5–9), finish the set inside it. If you blow past it, drop the weight next set.',
  ].join('\n')),
];

const seatedStretch = { name: 'Seated Side Leg Glute Stretch', alternatives: ['Quad Stretch', 'Pigeon Stretch'], sets: 2, seconds: 60, load: noLoad };

/** Closely follows the sample document's two full-body days. */
export const danielPlan: ProgramDraft = personalTraining({
  key: 'daniel/nov',
  title: 'Full Body Strength & Conditioning',
  coachNotes: 'Two full-body sessions a week. Do the warm-up and hip mobility circuit before each session and the foam rolling circuit after. Rest 60–90 s between sets.',
  weeks: 4,
  startDate: '2026-11-01',
  shared: [warmUp, hipMobility, foamRolling],
  resources: rpeGuide('daniel/nov'),
  days: [
    {
      focus: 'Full Body',
      exercises: [
        { name: 'Dumbbell Incline Press', sets: 3, reps: 12, load: lb(40), rpe: 8 },
        { name: 'Kettlebell Stiff Legged Deadlift', sets: 3, reps: 18, load: lb(40), rpe: 8 },
        { name: 'Dumbbell Lateral Raise', sets: 3, reps: [12, 15], load: lb(10), rpe: 8.5 },
        { name: 'Horizontal Pec Stretch', alternatives: ['Quad Stretch', 'Overhead Tricep Stretch'], sets: [2, 3], seconds: 60, load: noLoad },
        { name: 'Walking Lunges', sets: 2, reps: 15, perSide: true, load: lb(25), rpe: [8.5, 9] },
        { name: 'Side Leg Rainbow', sets: [2, 3], seconds: 60, load: bodyweight, rpe: 8.5 },
        { name: 'Dumbbell Rear Delt Fly', sets: [2, 3], reps: 15, load: lb(5), rpe: 8 },
        seatedStretch,
      ],
    },
    {
      focus: 'Full Body',
      exercises: [
        { name: 'Bench Dumbbell Pullover', sets: 2, reps: { perSet: [20, 18] }, load: lb(35), rpe: 8, notes: 'One dumbbell held with both hands.' },
        { name: 'Dumbbells on Shoulder Front Squat', sets: 2, reps: { perSet: [14, 12] }, load: lb(25), rpe: [8, 9] },
        { name: 'Reverse Nordic', sets: 2, reps: { perSet: [12, 10] }, load: bodyweight, rpe: [6, 7], notes: 'Only lean back as far as you can control.' },
        { name: 'Dumbbell Overhead Extension', sets: 2, reps: 15, load: lb(20), rpe: 8.5, notes: 'One dumbbell held with both hands.' },
        { name: 'Diamond Side Arm Raise', sets: 2, reps: 10, load: bodyweight, rpe: 8 },
        { name: 'Walking Lunges', sets: 2, reps: 15, perSide: true, load: lb(25), rpe: [8.5, 9] },
        { name: 'Dumbbell Rear Delt Fly', sets: [2, 3], reps: 15, load: lb(8), rpe: 8 },
        seatedStretch,
      ],
    },
  ],
});

/** Daniel's first plan, archived when the November plan replaced it. */
export const danielFirstPlan: ProgramDraft = personalTraining({
  key: 'daniel/aug',
  title: 'Full Body Foundations',
  coachNotes: 'Learning the main patterns: squat, hinge, push and pull. Keep every set at RPE 7 or below for now.',
  weeks: 4,
  startDate: '2026-10-04',
  shared: [warmUp, foamRolling],
  days: [
    {
      focus: 'Full Body',
      exercises: [
        { name: 'Goblet Box Squat', sets: 3, reps: 10, load: lb(25), rpe: [6, 7] },
        { name: 'Dumbbell Floor Press', sets: 3, reps: 10, load: lb(30), rpe: [6, 7] },
        { name: 'Kettlebell Deadlift', sets: 3, reps: 10, load: lb(35), rpe: [6, 7] },
        { name: 'Band Seated Row', sets: 3, reps: 15, load: band('Green'), rpe: 7 },
        { name: 'Dead Bug', sets: 2, reps: 8, perSide: true, load: bodyweight },
      ],
    },
    {
      focus: 'Full Body',
      exercises: [
        { name: 'Dumbbell Step-Up', sets: 2, reps: 10, perSide: true, load: lb(15), rpe: 7 },
        { name: 'Incline Pushup', sets: 3, reps: [8, 12], load: bodyweight, rpe: 7 },
        { name: 'Glute Bridge', sets: 3, reps: 15, load: band('Blue') },
        { name: 'Half-Kneeling Band Pulldown', sets: 2, reps: 12, perSide: true, load: band('Green') },
        { name: 'Front Plank', sets: 2, seconds: 30, load: bodyweight },
      ],
    },
  ],
});

/** One coached session a week alongside her mesocycle. */
const graceTechnique: PtSpec = {
  key: 'grace/technique',
  title: 'Technique Session Plan',
  coachNotes: 'Weekly in-person session focused on squat and hinge technique for the mesocycle\'s lower days. Loads stay moderate; quality first.',
  weeks: 4,
  startDate: '2026-11-02',
  shared: [warmUp, hipMobility],
  days: [
    {
      focus: 'Squat & Hinge',
      exercises: [
        { name: 'Dowel Hip Hinge Drill', sets: 2, reps: 10, load: noLoad, notes: 'Dowel touching head, upper back and tailbone.' },
        { name: 'Barbell Box Squat', sets: 3, reps: 5, load: lb(95), rpe: [6, 7], addLb: 10, notes: 'Tempo 3-1-1. Sit back to the box without relaxing.' },
        { name: 'Trap Bar Deadlift', sets: 4, reps: 5, load: lb(155), rpe: 7, addLb: 10 },
        { name: 'Single Leg Romanian Deadlift', sets: 2, reps: 8, perSide: true, load: lb(25), rpe: 7 },
        { name: 'Copenhagen Plank', sets: 2, seconds: 20, perSide: true, load: bodyweight },
      ],
    },
  ],
};
export const gracePlan = personalTraining(graceTechnique);
export const graceFirstPlan = personalTraining({
  ...graceTechnique,
  key: 'grace/technique-base',
  title: 'Squat & Hinge Foundations',
  startDate: '2026-10-05',
  coachNotes: 'Learn the box squat and set up the trap bar the same way each week. Keep a steady pace and aim for RPE 6–7.',
  resources: rpeGuide('grace/technique-base'),
  days: graceTechnique.days.map(day => ({
    ...day,
    exercises: day.exercises.map(exercise => ({
      ...exercise,
      load: exercise.load?.mode === 'external' ? lb(exercise.load.value.min - (exercise.addLb ?? 5) * 2) : exercise.load,
      addLb: exercise.addLb ? 5 : undefined,
    })),
  })),
});

export const ryanPlan: ProgramDraft = personalTraining({
  key: 'ryan/return',
  title: 'Return to Training Plan',
  coachNotes: 'Coming back after a lower-back flare-up. No spinal loading above RPE 7 and stop any exercise that brings back the pain. Two sessions a week.',
  weeks: 2,
  startDate: '2026-06-20',
  shared: [warmUp, hipMobility, foamRolling],
  days: [
    {
      focus: 'Full Body',
      exercises: [
        { name: 'Bird Dog', sets: 2, reps: 8, perSide: true, load: bodyweight },
        { name: 'Goblet Box Squat', sets: 3, reps: 10, load: lb(35), rpe: [6, 7], addLb: 5 },
        { name: 'Dumbbell Incline Press', sets: 3, reps: 10, load: lb(45), rpe: 7 },
        { name: 'Chest Supported Dumbbell Row', sets: 3, reps: 12, load: lb(35), rpe: 7 },
        { name: 'Suitcase Carry', sets: 2, seconds: 30, perSide: true, load: lb(35), notes: 'Stand tall; don\'t lean toward the weight.' },
      ],
    },
    {
      focus: 'Full Body',
      exercises: [
        { name: 'Kettlebell Deadlift', sets: 3, reps: 8, load: lb(44), rpe: [6, 7], addLb: 9, notes: 'Kettlebells come in 44 and 53 lb.' },
        { name: 'Split Squat', sets: 2, reps: 10, perSide: true, load: lb(20), rpe: 7 },
        { name: 'Half-Kneeling Single Arm Pulldown', sets: 3, reps: 12, perSide: true, load: lb(50), rpe: 7 },
        { name: 'Landmine Press', sets: 2, reps: 10, perSide: true, load: lb(25), rpe: 7 },
        { name: 'Side Plank', sets: 2, seconds: 25, perSide: true, load: bodyweight },
      ],
    },
  ],
});
