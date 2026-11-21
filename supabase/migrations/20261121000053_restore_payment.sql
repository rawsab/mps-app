-- Billing (decision 0053): "Mark paid" on a payment that was marked unpaid. Restoring it clears the void
-- and applies it again, oldest open charges first, like any payment (its old allocations were deleted).
-- The void stays in billing_events.
create or replace function public.restore_payment(p_payment_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  p public.billing_payments;
begin
  select * into p from public.billing_payments where id = p_payment_id;
  if not found or not private.staff_can_access_client(p.client_id) then
    raise exception 'payment not found' using errcode = '42501';
  end if;
  perform private.lock_billing(p.client_id);
  if p.voided_at is null then
    -- A retry after success: nothing to do.
    return public.get_client_billing(p.client_id);
  end if;
  update public.billing_payments set voided_at = null, voided_by = null, void_reason = '' where id = p.id;
  perform private.billing_event(p.client_id, 'payment_restored', null, p.id, jsonb_build_object('voidReason', p.void_reason));
  perform private.apply_credit(p.client_id);
  return public.get_client_billing(p.client_id);
end;
$$;

revoke all on function public.restore_payment(uuid) from public, anon, authenticated;
grant execute on function public.restore_payment(uuid) to authenticated;
