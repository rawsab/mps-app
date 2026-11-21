-- LOCAL DEVELOPMENT DATA ONLY. Open client requests and billing history for Activity, Reviews and
-- the Billing page. Everything goes through the functions the apps call, acting as the client or
-- coach, then is backdated. Loaded after availability.sql: a picked reschedule time must be open.
begin;

do $$
declare
  demo_on date := (select (created_at at time zone 'America/Toronto')::date + 140 from public.clients
    where id = '10000000-0000-4000-b000-000000000001');
  this_month date := private.billing_month();
  coach_tz constant text := 'America/Toronto';
  matt constant uuid := '00000000-0000-4000-a000-000000000001';
  priya constant uuid := '00000000-0000-4000-a000-000000000002';
  maya constant uuid := '10000000-0000-4000-b000-000000000001';
  daniel constant uuid := '10000000-0000-4000-b000-000000000002';
  grace constant uuid := '10000000-0000-4000-b000-000000000009';
  req record;
  a public.meetings;
  preferred timestamptz;
  payer record;
  month record;
  paid_on date;
  payment_id uuid;
  notice_id uuid;
  ids uuid[];
  owed integer;
begin
  if exists (select 1 from public.service_requests where id = md5('mps-demo/request/daniel-mesocycle')::uuid) then
    return;
  end if;

  -- Service requests, from clients who don't have the service yet.
  for req in
    select * from (values
      ('daniel-mesocycle', daniel, 'mesocycle', 2, time '12:20',
        'Could you write me a plan for the days I''m not training with Matt? I have a rack and adjustable dumbbells at home.'),
      ('maya-pt', maya, 'personal_training', 3, time '08:40',
        'Could we add a few in-person sessions? I''d like someone to check my squat and deadlift form before the next block gets heavier.')
    ) as v(key, client_id, service, days_ago, at_time, message)
  loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub',
      (select auth_user_id from public.clients where id = req.client_id), 'role', 'authenticated')::text, true);
    perform public.request_service(md5('mps-demo/request/' || req.key)::uuid, req.service, req.message);
    update public.service_requests set created_at = (demo_on - req.days_ago + req.at_time) at time zone coach_tz
    where id = md5('mps-demo/request/' || req.key)::uuid;
  end loop;

  -- Meeting requests on upcoming meetings (ids as in meetings.sql). Lateness is recomputed for the backdated send.
  for req in
    select * from (values
      ('daniel-move', 'daniel-pt', 8, 'reschedule', 1, time '13:10',
        'I''m travelling for work that day. Could we move it to later in the week?'),
      ('maya-cancel', 'maya-check-in', 6, 'cancel', 1, time '21:15',
        'I''ll be at a conference all week. Can we pick things up at the next check-in?'),
      ('grace-cancel', 'grace-pt', 11, 'cancel', 0, time '07:40',
        'My sister''s wedding is that weekend and I''m helping set up. Can we skip this one?')
    ) as v(key, pattern, days_ahead, kind, days_ago, at_time, message)
  loop
    select * into strict a from public.meetings where id = md5('mps-demo/meeting/' || req.pattern || '/' || req.days_ahead)::uuid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub',
      (select auth_user_id from public.clients where id = a.client_id), 'role', 'authenticated')::text, true);
    preferred := case when req.kind = 'reschedule' then
      (select s from private.open_slots(a.coach_id, a.duration_minutes, a.id) s
       where s >= a.starts_at + interval '1 day' and s < a.starts_at + interval '5 days' order by s limit 1) end;
    perform public.request_meeting_change(md5('mps-demo/request/' || req.key)::uuid, a.id, req.kind, req.message, preferred);
    update public.meeting_requests r
    set created_at = least(now() - interval '5 minutes', (demo_on - req.days_ago + req.at_time) at time zone coach_tz)
    where r.id = md5('mps-demo/request/' || req.key)::uuid;
    update public.meeting_requests r set late = a.billable and a.starts_at - r.created_at < interval '24 hours'
    where r.id = md5('mps-demo/request/' || req.key)::uuid and r.kind = 'cancel';
  end loop;

  -- Past months of PT sessions are paid. The latest one differs per client: Daniel's was reported and
  -- confirmed, and Grace's was reported and then marked paid (settled).
  for payer in
    select * from (values
      ('daniel', daniel, matt, 'e_transfer'),
      ('grace', grace, priya, 'cash')
    ) as v(key, client_id, coach, method)
  loop
    for month in
      select ch.period, sum(ch.amount_cents)::integer as total, array_agg(ch.id order by ch.occurred_on, ch.id) as charge_ids,
        row_number() over (order by ch.period desc) as back
      from public.billing_charges ch
      where ch.client_id = payer.client_id and ch.voided_at is null and ch.period < this_month
      group by ch.period order by ch.period
    loop
      paid_on := least((month.period + interval '1 month')::date + 2, demo_on - 1);
      payment_id := md5('mps-demo/payment/' || payer.key || '/' || month.period)::uuid;
      notice_id := md5('mps-demo/notice/' || payer.key || '/' || month.period)::uuid;
      perform set_config('request.jwt.claims', jsonb_build_object('sub', payer.coach, 'role', 'authenticated')::text, true);
      if month.back > 1 then
        perform public.record_payment(payment_id, payer.client_id, month.total, paid_on, payer.method, '', month.charge_ids);
      else
        perform set_config('request.jwt.claims', jsonb_build_object('sub',
          (select auth_user_id from public.clients where id = payer.client_id), 'role', 'authenticated')::text, true);
        perform public.report_payment_sent(notice_id, month.total, paid_on,
          'Sent by e-Transfer for ' || to_char(month.period, 'FMMonth') || '''s sessions.', month.charge_ids);
        perform set_config('request.jwt.claims', jsonb_build_object('sub', payer.coach, 'role', 'authenticated')::text, true);
        if payer.key = 'daniel' then
          perform public.record_reported_payment(notice_id, payment_id, month.total, paid_on, 'e_transfer', '');
        else
          perform public.mark_charges_paid(payment_id, month.charge_ids, paid_on, 'e_transfer', 'Matched to the transfer Grace sent.');
        end if;
        update public.billing_payment_notices
        set reported_at = (paid_on + time '08:10') at time zone coach_tz, created_at = (paid_on + time '08:10') at time zone coach_tz,
          resolved_at = (paid_on + time '19:30') at time zone coach_tz, updated_at = (paid_on + time '19:30') at time zone coach_tz
        where id = notice_id;
      end if;
      update public.billing_payments set recorded_at = (paid_on + time '19:30') at time zone coach_tz where id = payment_id;
    end loop;
  end loop;

  -- Grace paid for this month's first sessions in cash at the gym.
  select array_agg(ch.id order by ch.occurred_on, ch.id), sum(ch.amount_cents)::integer into ids, owed
  from public.billing_charges ch
  where ch.client_id = grace and ch.voided_at is null and ch.period = this_month and ch.occurred_on <= demo_on - 7;
  if owed > 0 then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', priya, 'role', 'authenticated')::text, true);
    perform public.record_payment(md5('mps-demo/payment/grace-cash')::uuid, grace, owed, demo_on - 7, 'cash', '', ids);
    update public.billing_payments set recorded_at = (demo_on - 7 + time '12:15') at time zone coach_tz
    where id = md5('mps-demo/payment/grace-cash')::uuid;
  end if;

  -- Waiting on the coach: Daniel says he paid this month's sessions so far.
  select array_agg(ch.id order by ch.occurred_on, ch.id), sum(ch.amount_cents)::integer into ids, owed
  from public.billing_charges ch
  where ch.client_id = daniel and ch.voided_at is null and ch.period = this_month and ch.amount_cents > private.charge_allocated(ch.id);
  if owed > 0 then
    perform set_config('request.jwt.claims', jsonb_build_object('sub',
      (select auth_user_id from public.clients where id = daniel), 'role', 'authenticated')::text, true);
    perform public.report_payment_sent(md5('mps-demo/notice/daniel-current')::uuid, owed, greatest(this_month, demo_on - 1),
      'Sent for this month''s sessions so far.', ids);
    update public.billing_payment_notices
    set reported_at = least(now(), (greatest(this_month, demo_on - 1) + time '20:05') at time zone coach_tz), created_at = reported_at
    where id = md5('mps-demo/notice/daniel-current')::uuid;
  end if;

  -- Maya's first report had a typo and was dismissed; her corrected one is waiting.
  owed := (private.billing_summary(maya)->>'balanceCents')::integer;
  if owed > 0 then
    perform set_config('request.jwt.claims', jsonb_build_object('sub',
      (select auth_user_id from public.clients where id = maya), 'role', 'authenticated')::text, true);
    perform public.report_payment_sent(md5('mps-demo/notice/maya-typo')::uuid, owed / 10, demo_on - 3,
      'Sent this month''s programming.', '{}');
    perform set_config('request.jwt.claims', jsonb_build_object('sub', matt, 'role', 'authenticated')::text, true);
    perform public.dismiss_payment_notice(md5('mps-demo/notice/maya-typo')::uuid,
      'No transfer for this amount came through. Asked Maya to check what she sent.');
    update public.billing_payment_notices
    set reported_at = (demo_on - 3 + time '09:15') at time zone coach_tz, created_at = (demo_on - 3 + time '09:15') at time zone coach_tz,
      resolved_at = (demo_on - 2 + time '10:00') at time zone coach_tz, updated_at = (demo_on - 2 + time '10:00') at time zone coach_tz
    where id = md5('mps-demo/notice/maya-typo')::uuid;

    perform set_config('request.jwt.claims', jsonb_build_object('sub',
      (select auth_user_id from public.clients where id = maya), 'role', 'authenticated')::text, true);
    perform public.report_payment_sent(md5('mps-demo/notice/maya-full')::uuid, owed, demo_on - 1,
      'Resent it for the full amount. The first one was a typo, sorry!', '{}');
    update public.billing_payment_notices
    set reported_at = (demo_on - 1 + time '18:40') at time zone coach_tz, created_at = (demo_on - 1 + time '18:40') at time zone coach_tz
    where id = md5('mps-demo/notice/maya-full')::uuid;
  end if;

  -- The billing history follows the backdated payments and notices.
  update public.billing_events e set at = p.recorded_at
  from public.billing_payments p where p.id = e.payment_id;
  update public.billing_events e
  set at = case when e.action = 'payment_reported' then n.reported_at else coalesce(n.resolved_at, n.reported_at) end
  from public.billing_payment_notices n
  where e.payment_id is null and n.id = (e.details->>'noticeId')::uuid;
end $$;

commit;
