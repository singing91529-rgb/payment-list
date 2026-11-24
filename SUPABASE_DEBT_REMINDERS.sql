-- Payment Hub 欠款提醒：資料表僅管理者可讀寫；訪客只能透過 Edge Function 送出。
create table if not exists public.debt_reminders (
  id uuid primary key default gen_random_uuid(),
  sender_name text not null check (char_length(sender_name) between 1 and 80),
  subject text not null check (char_length(subject) between 1 and 160),
  amount numeric(12,2) not null check (amount > 0 and amount <= 99999999),
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.debt_reminders enable row level security;
revoke all on public.debt_reminders from anon, authenticated;
grant select, insert, update, delete on public.debt_reminders to authenticated;

drop policy if exists "debt reminders admin select" on public.debt_reminders;
drop policy if exists "debt reminders admin insert" on public.debt_reminders;
drop policy if exists "debt reminders admin update" on public.debt_reminders;
drop policy if exists "debt reminders admin delete" on public.debt_reminders;

create policy "debt reminders admin select" on public.debt_reminders
for select to authenticated using (public.is_payment_admin());
create policy "debt reminders admin insert" on public.debt_reminders
for insert to authenticated with check (public.is_payment_admin());
create policy "debt reminders admin update" on public.debt_reminders
for update to authenticated using (public.is_payment_admin()) with check (public.is_payment_admin());
create policy "debt reminders admin delete" on public.debt_reminders
for delete to authenticated using (public.is_payment_admin());

-- 此表僅供 Edge Function service_role 做簡易 IP 節流；一般使用者無任何權限。
create table if not exists public.debt_submission_limits (
  ip_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.debt_submission_limits enable row level security;
revoke all on public.debt_submission_limits from anon, authenticated;
