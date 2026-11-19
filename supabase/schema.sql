create table if not exists public.meetings (
  date date primary key,
  title text not null default ''
);

create table if not exists public.attendance_records (
  meeting_date date not null references public.meetings(date) on delete cascade,
  member_id text not null,
  status text not null check (status in ('present', 'absent')),
  primary key (meeting_date, member_id)
);

alter table public.meetings enable row level security;
alter table public.attendance_records enable row level security;

grant usage on schema public to anon;
grant select, insert, update, delete on public.meetings to anon;
grant select, insert, update, delete on public.attendance_records to anon;

drop policy if exists "Anyone can manage attendance meeting dates" on public.meetings;
create policy "Anyone can manage attendance meeting dates"
  on public.meetings for all to anon
  using (true) with check (true);

drop policy if exists "Anyone can manage attendance records" on public.attendance_records;
create policy "Anyone can manage attendance records"
  on public.attendance_records for all to anon
  using (true) with check (true);
