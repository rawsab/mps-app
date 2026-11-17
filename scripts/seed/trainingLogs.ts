import type { Exercise } from '@/domain/programs/contract';
import type { SeedProgram } from './programs';
import { seedId } from './builders';

// Starting working loads in lb. Values for the assisted movements are counterweights.
const workingLoads: Record<string, number> = {
  'Silver Leg Press': 180, '2/3 Bottom Depth Squat': 30, 'Single Leg Hip Thrust': 20,
  'Assisted Hamstring Extension': 40, 'Lying Hamstring Curl': 55, 'Seated Calf Raise': 55,
  'Red Machine Shoulder Press': 45, 'Cable Row': 75, 'Assisted Chinup': 55, 'Cable Lat Pullover': 35,
  'Dumbbell Bent High Row': 25, 'Dumbbell Rear Delt Fly': 12.5, 'Incline Curl': 15,
  'Machine Curl': 35, 'Plate Incline Press (4 seat)': 65, 'Machine Press Red (6 seat)': 55,
  'Machine Chest Fly': 55, 'Barbell Skullcrusher': 30, 'Cable Rope Tricep Extension': 30,
  'Cable Overhead Extension': 25, 'Wall Lateral Raise': 7.5, 'Leg Extension': 70,
  'Elevated Reverse Lunge': 20, 'Seated Hamstring Curl': 65, 'Machine Row (Red, 5 seat)': 75,
  'Plate Single Arm Row': 45, 'Plate Pulldown': 75, 'Dumbbell Hammer Curl': 17.5,
  'Seated Wrist Extension': 10, 'Dumbbell Incline Press': 30, 'Cable Chest Fly': 15,
  'Rope Facepull (Chin)': 35, 'Leaning Lateral Raise': 7.5, 'Cable Rope Extension': 30,
  'Machine Skullcrusher': 35, 'Assisted Dip': 45,
  'Machine Hip Thrust': 155, 'Smith Machine Squat': 105, '45° Back Extension': 15,
  'Cable Glute Kickback': 20, 'Seated Hip Abduction': 90, 'Machine Chest Press': 55,
  'Neutral Grip Pulldown': 75, 'Chest Supported Row': 60, 'Dumbbell Shoulder Press': 20,
  'Cable Lateral Raise': 7.5, 'EZ Bar Curl': 30, 'Rope Pushdown': 25,
  'Dumbbell Romanian Deadlift': 45, 'Bulgarian Split Squat': 25, 'Cable Pull-Through': 50,
  'Single Arm Cable Row': 35, 'Assisted Pull-up': 50, 'Pec Deck': 50, 'Reverse Pec Deck': 35,
  'Dumbbell Lateral Raise': 10,
  'Goblet Squat': 25, 'Dumbbell Bench Press': 20, 'Lat Pulldown': 55,
  'Leg Press': 95, 'Seated Cable Row': 50,
};

function logSets(exercise: Exercise, week: number, weeks: number, historical: boolean, position: number, day: number, stoppedShort: boolean) {
  const sets = exercise.prescription.setCount!.max;
  const targets = exercise.prescription.targets;
  const bodyweight = targets[0]!.load?.mode === 'bodyweight';
  const base = workingLoads[exercise.name];
  if (!bodyweight && base === undefined) throw new Error(`Demo working load missing for ${exercise.name}`);
  const assisted = exercise.name.startsWith('Assisted');
  const step = (base ?? 0) >= 45 ? 5 : 2.5;
  const progression = Math.floor(week / 2) + (historical ? -1 : 1);
  const workingLoad = (base ?? 0) + step * progression * (assisted ? -1 : 1);
  const deload = week === weeks - 1;
  return Array.from({ length: sets }, (_, index) => {
    const target = targets[index] ?? targets[0]!;
    if (target.effort?.kind !== 'reps') throw new Error(`Demo rep target missing for ${exercise.name}`);
    const { min, max } = target.effort.reps;
    const drop = target.annotations.includes('drop set') && !assisted;
    const adjusted = deload ? (assisted ? workingLoad + step : workingLoad * 0.8) : drop ? workingLoad * 0.7 : workingLoad;
    const reps = stoppedShort && index === sets - 1 ? min - 2
      : Math.max(min, Math.min(max, min + 1 + (week + day + position) % 3 - index));
    return {
      exercise_id: exercise.id, set_number: index + 1, reps,
      load_mode: bodyweight ? 'bodyweight' : assisted ? 'assisted' : 'external',
      load_value: bodyweight ? null : Math.max(step, Math.round(adjusted / step) * step),
    };
  });
}

const sessionNotes: Record<string, string> = {
  'maya/meso3/1/2': 'Skullcrushers irritated my left elbow. Stayed at the low end of the rep range.',
  'maya/meso3/1/5': 'Lateral raises felt mostly like traps today. Try a lighter dumbbell and slow the lowering.',
  'maya/meso3/2/1': 'Travel day. Could not get to the gym before my flight.',
  'maya/meso3/2/4': 'Logged the first two exercises at the gym. The rest are still in my notebook.',
  'grace/meso1/1/2': 'Kept the RDLs at the same weight and got a much better stretch with the slower lowering.',
  'grace/meso1/3/1': 'Cut the last pulldown set short after a poor night of sleep.',
  'sofia/base/1/1': 'Gym was quiet, so I could keep the same row setup as last time.',
};

export function renderTrainingLogs(programs: SeedProgram[]): string {
  const rows = programs.filter(program => program.service === 'mesocycle').flatMap(program => {
    const draft = program.revisions.find(revision => revision.publish)!.draft;
    return draft.weeks.flatMap((week, w) => week.days.map((day, d) => {
      const key = `${program.key}/${w}/${d}`;
      const status = key === 'maya/meso3/2/1' ? 'skipped' : key === 'maya/meso3/2/4' ? 'in_progress' : 'completed';
      const exercises = day.sections.flatMap(section => section.exercises);
      const logged = status === 'skipped' ? [] : status === 'in_progress' ? exercises.slice(0, 2) : exercises;
      const sets = logged.flatMap((exercise, index) => logSets(
        exercise, w, draft.weeks.length, !!program.archivedDaysAgo, index, d,
        key === 'grace/meso1/3/1' && exercise.name === 'Neutral Grip Pulldown',
      ));
      const muscles = status !== 'completed' ? [] : [...new Set(exercises.flatMap(exercise => exercise.muscles))];
      const feedback = muscles.filter((_, index) => (w + d + index) % 5 !== 4).map((muscle, index) => ({
        muscle,
        challenge: w === draft.weeks.length - 1 ? 1 : 1 + (index + d + w) % 3,
        pump: muscle === 'Middle Delts' && key === 'maya/meso3/1/5' ? 0 : 1 + (index + d) % 2,
        disruption: (index + w) % 3 === 0 ? 2 : 1,
        soreness: (d + index) % 3,
        performance: (w + index) % 4 === 0 ? 2 : 1,
      }));
      return JSON.stringify({ id: seedId(`session/${key}`), program_id: seedId(`program/${program.key}`),
        day_id: day.id, status, notes: sessionNotes[key] ?? '', sets, feedback });
    }));
  });

  return `-- Mesocycle actuals, in scheduled order. PT outcomes are recorded as meetings, alongside RPE prescriptions.
create temporary table demo_workouts (entry jsonb) on commit drop;
insert into demo_workouts values
${rows.map(row => `($workout$${row}$workout$)`).join(',\n')};

-- Only days strictly before the demo date have logs, including the deliberately unfinished workout.
create temporary table demo_seeded_sessions (id uuid primary key) on commit drop;
with scheduled as (
  select (workout.entry->>'id')::uuid as id, p.id as program_id, p.current_revision_id as revision_id,
    day.id as day_id, c.id as client_id, c.auth_user_id as actor, day.scheduled_date,
    (day.scheduled_date + time '17:45' + make_interval(mins => day.position * 10)) at time zone c.timezone as started_at,
    (workout.entry->>'status')::public.session_status as status, workout.entry->>'notes' as notes
  from demo_workouts workout
  join public.programs p on p.id = (workout.entry->>'program_id')::uuid
  join public.workout_days day on day.id = (workout.entry->>'day_id')::uuid and day.revision_id = p.current_revision_id
  join public.clients c on c.id = p.client_id
  where day.scheduled_date < pg_temp.demo_today()
), inserted as (
  insert into public.training_sessions (id, client_id, program_id, revision_id, day_id, status, performed_on,
    started_at, completed_at, notes, created_by, updated_by, created_at, updated_at)
  select id, client_id, program_id, revision_id, day_id, status, case when status <> 'skipped' then scheduled_date end,
    started_at, case when status = 'completed' then started_at + interval '55 minutes' end, notes, actor, actor,
    started_at, started_at + case status when 'completed' then interval '55 minutes' when 'in_progress' then interval '25 minutes' else interval '0' end
  from scheduled
  on conflict (program_id, day_id) do nothing
  returning id
)
insert into demo_seeded_sessions select id from inserted;

insert into public.logged_sets (id, session_id, client_id, revision_id, exercise_id, set_number,
  load_mode, load_value, load_unit, reps, created_by, updated_by, created_at, updated_at)
select md5('mps-demo/set/' || session.id || '/' || log.exercise_id || '/' || log.set_number)::uuid,
  session.id, session.client_id, session.revision_id, log.exercise_id, log.set_number,
  log.load_mode, log.load_value, case when log.load_value is not null then 'lb'::public.weight_unit end, log.reps,
  session.created_by, session.created_by, session.started_at + interval '5 minutes', session.updated_at
from demo_workouts workout
join demo_seeded_sessions seeded on seeded.id = (workout.entry->>'id')::uuid
join public.training_sessions session on session.id = seeded.id
join public.programs p on p.id = session.program_id and p.current_revision_id = session.revision_id
cross join lateral jsonb_to_recordset(workout.entry->'sets')
  as log(exercise_id uuid, set_number integer, load_mode public.load_mode, load_value numeric, reps integer)
on conflict (session_id, exercise_id, set_number) do nothing;

insert into public.muscle_feedback (session_id, client_id, muscle_key, muscle_name, challenge, pump, disruption,
  soreness, performance, compared_session_id, created_by, updated_by, created_at, updated_at)
select session.id, session.client_id, lower(log.muscle), log.muscle, log.challenge, log.pump, log.disruption,
  case when prior.id is not null then log.soreness end, case when prior.id is not null then log.performance end,
  prior.id, session.created_by, session.created_by, session.completed_at, session.completed_at
from demo_workouts workout
join demo_seeded_sessions seeded on seeded.id = (workout.entry->>'id')::uuid
join public.training_sessions session on session.id = seeded.id
join public.programs p on p.id = session.program_id and p.current_revision_id = session.revision_id
cross join lateral jsonb_to_recordset(workout.entry->'feedback')
  as log(muscle text, challenge smallint, pump smallint, disruption smallint, soreness smallint, performance smallint)
left join lateral (
  select previous.id from public.training_sessions previous
  where previous.program_id = session.program_id and previous.status = 'completed'
    and previous.started_at < session.started_at and private.session_trains_muscle(previous, lower(log.muscle))
  order by previous.started_at desc limit 1
) prior on true
where session.status = 'completed'
on conflict (session_id, muscle_key) do nothing;

-- Coaches have already reviewed older demo activity. Keep the latest three days unread.
insert into public.staff_activity_seen (staff_id, session_id, seen_at)
select staff.auth_user_id, session.id, session.updated_at
from demo_seeded_sessions seeded
join public.training_sessions session on session.id = seeded.id
cross join public.staff_roles staff
where session.started_at < (pg_temp.demo_today() - 3)::timestamp at time zone 'America/Toronto'
  and (staff.role = 'admin' or exists (select 1 from public.coach_clients cc
    where cc.coach_id = staff.auth_user_id and cc.client_id = session.client_id))
on conflict (staff_id, session_id) do nothing;`;
}
