-- Billing (decision 0053, phase B): pattern documents include their Solo / Partner format, so the
-- pattern editor can show and keep it. Otherwise the same as schedule_document in migration 00035.
create or replace function private.schedule_document(p_schedule_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'clientId', s.client_id, 'cycleWeeks', s.cycle_weeks, 'anchorOn', s.anchor_on,
    'startsOn', s.starts_on, 'endsOn', s.ends_on, 'timezone', s.timezone, 'replacesId', s.replaces_id,
    'services', to_jsonb(s.services), 'format', s.format,
    'programs', (select coalesce(jsonb_object_agg(p.service, coalesce(p.program_id, p.nutrition_program_id)), '{}'::jsonb)
      from public.meeting_schedule_programs p where p.schedule_id = s.id),
    -- Generating only while one of its services is active.
    'active', exists (select 1 from public.service_enrollments e where e.client_id = s.client_id and e.service = any (s.services)
      and e.status = 'active' and e.archived_at is null),
    -- RLS: staff only; clients get null.
    'notes', (select n.body from public.meeting_schedule_notes n where n.schedule_id = s.id),
    'slots', private.schedule_slots_json(s.id))
  from public.meeting_schedules s where s.id = p_schedule_id;
$$;
