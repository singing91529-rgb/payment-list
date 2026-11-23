-- Payment Hub private friends directory access
-- Run this in Supabase SQL Editor after creating friend_bank_accounts
-- and the payment-viewer@payment-hub.local Auth user.

grant usage on schema public to authenticated;
grant select on public.friend_bank_accounts to authenticated;
grant insert, update, delete on public.friend_bank_accounts to authenticated;

alter table public.friend_bank_accounts enable row level security;

-- Only the dedicated viewer account and Payment Hub administrators can read.
drop policy if exists "friend accounts authenticated read" on public.friend_bank_accounts;
drop policy if exists "friend accounts viewer and admin read" on public.friend_bank_accounts;
create policy "friend accounts viewer and admin read"
on public.friend_bank_accounts
for select
to authenticated
using (
  (auth.uid() = '8b6836cc-f0fe-4496-9661-95158b98cb73'::uuid and is_active = true)
  or public.is_payment_admin()
);

-- Keep all write operations restricted to existing Payment Hub admins.
drop policy if exists "friend accounts admin insert" on public.friend_bank_accounts;
create policy "friend accounts admin insert"
on public.friend_bank_accounts
for insert to authenticated
with check (public.is_payment_admin());

drop policy if exists "friend accounts admin update" on public.friend_bank_accounts;
create policy "friend accounts admin update"
on public.friend_bank_accounts
for update to authenticated
using (public.is_payment_admin())
with check (public.is_payment_admin());

drop policy if exists "friend accounts admin delete" on public.friend_bank_accounts;
create policy "friend accounts admin delete"
on public.friend_bank_accounts
for delete to authenticated
using (public.is_payment_admin());

revoke all on public.friend_bank_accounts from anon;
