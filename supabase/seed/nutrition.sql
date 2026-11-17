-- LOCAL DEVELOPMENT DATA ONLY. Daily actuals use the same weigh-in / previous-day
-- calories convention as both Client Home and the nutrition spreadsheet.
begin;

do $$
declare
  block record;
  client public.clients;
  admin constant uuid := '00000000-0000-4000-a000-000000000001';
  demo_on date := (select (created_at at time zone 'America/Toronto')::date + 140 from public.clients
    where id = '10000000-0000-4000-b000-000000000001');
  v_program_id uuid;
  v_revision_id uuid;
  v_enrollment_id uuid;
  starts_on date;
  row_on date;
  logged_at timestamptz;
  prepared_at timestamptz;
  v_request_id uuid;
  entry jsonb;
  i integer;
begin
  for block in
    select * from (values
      (1, 'maintenance', 'Training Maintenance', 45, 4, 2260, 2250, 146.2, 0.012, 'lb', true,
        'Establish a baseline across training and rest days. Keep lunch consistent and include a snack on leg days.'),
      (1, 'surplus', 'Hypertrophy · Small Surplus', 17, 5, 2260, 2425, 146.5, 0.065, 'lb', false,
        'Add a carb serving before lifting. Aim for roughly 125 g protein, and use the weekly weight average when reviewing the surplus.'),
      (2, 'baseline', 'Baseline & Meal Routine', 39, 4, 2810, 2775, 92.5, -0.015, 'kg', true,
        'Get a good picture of a normal month. Record takeout and travel days using a reasonable estimate.'),
      (2, 'cut', 'Moderate Deficit', 11, 4, 2800, 2390, 92.0, -0.067, 'kg', false,
        'Plan lunch ahead of office days and aim for 155 g protein. Keep Saturday flexible and hold the deficit over the week.')
    ) as v(client_no, key, style, days_ago, weeks, maintenance, goal, baseline, daily_change, unit, historical, notes)
  loop
    select * into strict client from public.clients
    where id = ('10000000-0000-4000-b000-' || lpad(block.client_no::text, 12, '0'))::uuid;
    v_program_id := md5('mps-demo/nutrition/' || block.client_no || '/' || block.key)::uuid;
    if exists (select 1 from public.nutrition_programs p where p.id = v_program_id) then continue; end if;

    select id into strict v_enrollment_id from public.service_enrollments where client_id = client.id and service = 'nutrition';
    starts_on := demo_on - block.days_ago;
    prepared_at := (starts_on - 2 + time '16:00') at time zone client.timezone;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', admin, 'role', 'authenticated')::text, true);
    perform public.create_nutrition_program(v_enrollment_id, v_program_id);
    entry := public.save_nutrition_program_draft(v_program_id, 1, jsonb_build_object(
      'program_style', block.style, 'start_date', starts_on, 'week_count', block.weeks,
      'maintenance', block.maintenance, 'calorie_goal', block.goal, 'weight_unit', block.unit, 'notes', block.notes
    ));
    v_revision_id := (entry->>'id')::uuid;
    update public.nutrition_programs set created_at = prepared_at where id = v_program_id;
    -- Freeze the validated draft with the original handoff date.
    update public.nutrition_program_revisions set status = 'published', created_at = prepared_at,
      published_at = prepared_at + interval '1 day', published_by = admin where id = v_revision_id;
    update public.nutrition_programs set current_revision_id = v_revision_id where id = v_program_id;
    if not block.historical then perform public.set_current_program(v_enrollment_id, v_program_id); end if;

    perform set_config('request.jwt.claims', jsonb_build_object('sub', client.auth_user_id, 'role', 'authenticated')::text, true);
    for i in 0 .. least(block.weeks * 7, block.days_ago) - 1 loop
      row_on := starts_on + i;
      logged_at := (row_on + (case when i % 6 = 4 then time '12:25' else time '07:35' end)) at time zone client.timezone;
      -- Maya mostly logs daily. Daniel misses some weigh-ins and estimates meals when travelling.
      if (block.client_no = 1 and i not in (5, 19)) or (block.client_no = 2 and i % 7 not in (2, 5)) then
        v_request_id := md5('mps-demo/nutrition-weight/' || v_program_id || '/' || i)::uuid;
        entry := jsonb_build_object('weight', round(block.baseline + i * block.daily_change
          + ((i * 13 + i / 3 + block.client_no) % 11 - 5) * (case when block.unit = 'kg' then 0.09 else 0.19 end), 1), 'unit', block.unit);
        perform public.save_nutrition_entry(client.id, 'weight', row_on, entry, 0, v_request_id);
        update public.bodyweight_logs w set updated_at = logged_at where w.client_id = client.id and w.measured_on = row_on;
        update public.nutrition_entry_changes ch set created_at = logged_at,
          after_value = ch.after_value || jsonb_build_object('updated_at', logged_at) where ch.request_id = v_request_id;
      end if;

      if block.client_no = 1 or i % 9 <> 6 then
        v_request_id := md5('mps-demo/nutrition-food/' || v_program_id || '/' || i)::uuid;
        entry := jsonb_build_object(
          'intake', block.goal + ((i * 197 + i / 2 * 73) % 323 - 161) + case when i % 7 = 4 then 195 else 0 end,
          'output', case when block.client_no = 2 and i in (4, 16) then null
            else block.maintenance + ((i * 131 + i / 4 * 59) % 257 - 128) + case when i % 7 = 4 then -135 else 0 end end,
          'notes', case
            when block.client_no = 1 and i = 7 then 'Packed a bagel and yogurt for the gym.'
            when block.client_no = 1 and i = 13 then 'Dinner out. Estimated rice and chicken portions.'
            when block.client_no = 2 and i = 4 then 'Forgot the watch for the commute. Left output blank.'
            when block.client_no = 2 and i = 8 then 'Packed lunch for work. Walked home from the station.'
            else '' end
        );
        perform public.save_nutrition_entry(client.id, 'nutrition', row_on - 1, entry, 0, v_request_id);
        update public.nutrition_logs n set updated_at = logged_at where n.client_id = client.id and n.activity_on = row_on - 1;
        update public.nutrition_entry_changes ch set created_at = logged_at,
          after_value = ch.after_value || jsonb_build_object('updated_at', logged_at) where ch.request_id = v_request_id;
      end if;
      update public.nutrition_daily_activity a set client_activity_at = logged_at
      where a.client_id = client.id and a.logged_on = row_on and a.program_id = v_program_id;
    end loop;

    insert into public.staff_nutrition_activity_seen (staff_id, activity_id, seen_at)
    select staff.auth_user_id, a.id, a.client_activity_at
    from public.nutrition_daily_activity a cross join public.staff_roles staff
    where a.program_id = v_program_id and a.logged_on < demo_on - 3
      and (staff.role = 'admin' or exists (select 1 from public.coach_clients cc
        where cc.coach_id = staff.auth_user_id and cc.client_id = client.id))
    on conflict (staff_id, activity_id) do nothing;

    if block.historical then
      update public.nutrition_programs set archived_at = (starts_on + block.weeks * 7 + time '12:00') at time zone client.timezone
      where id = v_program_id;
    end if;
  end loop;
end $$;

commit;
