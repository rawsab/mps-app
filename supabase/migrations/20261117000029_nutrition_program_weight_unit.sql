-- Program weight units are revisioned; existing programs remain in pounds.
alter table public.nutrition_program_revisions add column weight_unit public.weight_unit not null default 'lb';

create or replace function public.save_nutrition_program_draft(p_program_id uuid, p_expected_version integer, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_programs; r public.nutrition_program_revisions; v_style text; v_start date; v_weeks numeric; v_maintenance numeric; v_goal numeric; v_notes text;
begin
  select * into p from public.nutrition_programs where id = p_program_id for update;
  if not found or not coalesce(private.staff_can_access_client(p.client_id),false) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p.archived_at is not null then raise exception 'This program is archived' using errcode = '55000'; end if;
  perform private.draft_expect_object(p_value, '');
  if (p_value - array['program_style','start_date','week_count','maintenance','calorie_goal','notes','weight_unit']) <> '{}'::jsonb then raise exception 'Unknown nutrition program fields' using errcode = '22023'; end if;
  v_style := private.draft_text(p_value,'program_style','');
  v_start := private.draft_text(p_value,'start_date','',true)::date;
  v_weeks := private.draft_number(p_value,'week_count','');
  v_maintenance := private.draft_number(p_value,'maintenance','',true);
  v_goal := private.draft_number(p_value,'calorie_goal','',true);
  v_notes := private.draft_text(p_value,'notes','');
  if v_weeks <> trunc(v_weeks) or v_maintenance <> trunc(v_maintenance) or v_goal <> trunc(v_goal) then raise exception 'Weeks and calories must be whole numbers' using errcode = '22023'; end if;
  select * into r from public.nutrition_program_revisions where program_id = p.id and status = 'draft';
  if r.lock_version is distinct from p_expected_version then raise exception 'This draft changed elsewhere. Reload it before saving again.' using errcode = 'PT409'; end if;
  if r.id is null then
    insert into public.nutrition_program_revisions(program_id,client_id,revision_number)
    values(p.id,p.client_id,(select coalesce(max(revision_number),0)+1 from public.nutrition_program_revisions where program_id = p.id)) returning * into r;
  else
    update public.nutrition_program_revisions set lock_version = lock_version + 1 where id = r.id returning * into r;
  end if;
  update public.nutrition_program_revisions set program_style = v_style, start_date = v_start, week_count = v_weeks,
    maintenance = v_maintenance, calorie_goal = v_goal, notes = v_notes, weight_unit = coalesce(p_value->>'weight_unit', 'lb')::public.weight_unit where id = r.id returning * into r;
  return to_jsonb(r) - array['client_id','program_id','created_at','published_by'];
end;
$$;

revoke all on function public.save_nutrition_program_draft(uuid,integer,jsonb) from public,anon;
grant execute on function public.save_nutrition_program_draft(uuid,integer,jsonb) to authenticated;
