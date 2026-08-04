-- 0006_phase2_holds_and_loans.sql
-- Phase 2 of the borrow/return kiosk plan: soft holds (2-minute copy
-- claims), loans, and an atomic claim function.
--
-- soft_holds and loans are written only via the service-role client (see
-- routers/holds.py and routers/loans.py) — a hold's token is the
-- authorization for everything downstream of claiming it (the student's
-- phone session scanning the QR has no Supabase JWT of its own), so RLS
-- on these tables stays enabled with no policies: deny by default for
-- every other caller, same pattern as station_sessions in Phase 1.

create table if not exists soft_holds (
  id                  uuid primary key default gen_random_uuid(),
  book_copy_id        uuid not null unique references book_copies(id) on delete cascade,
  station_session_id  uuid not null references station_sessions(id) on delete cascade,
  token               text not null unique,
  attempt_count       int not null default 0,
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now()
);

alter table soft_holds enable row level security;

create table if not exists loans (
  id                   uuid primary key default gen_random_uuid(),
  book_copy_id         uuid not null references book_copies(id) on delete restrict,
  student_id           uuid not null references profiles(id) on delete cascade,
  station_session_id   uuid references station_sessions(id) on delete set null,
  borrowed_at          timestamptz not null default now(),
  due_date             timestamptz not null,
  returned_at          timestamptz,
  status               text not null default 'active' check (status in ('active', 'returned', 'overdue')),
  condition_at_borrow  text not null check (condition_at_borrow in ('good', 'minor_wear', 'already_damaged')),
  purpose              text,
  notes                text
);

alter table loans enable row level security;

create index if not exists loans_student_idx on loans (student_id);
create index if not exists loans_copy_idx on loans (book_copy_id);
create index if not exists loans_status_idx on loans (status);

-- ─── Atomic copy claiming ───────────────────────────────────────────────
-- Two stations racing for the last available copy of a title must produce
-- exactly one winner. PostgREST has no way to express "SELECT ... FOR
-- UPDATE" or a multi-statement transaction from the client, so the whole
-- claim — pick the earliest available copy, try to place a hold on it,
-- fall through to the next candidate if it's already held — runs as one
-- Postgres function invocation, which is one transaction. The actual
-- race is arbitrated by the UNIQUE constraint on soft_holds.book_copy_id:
-- if two requests reach the same copy at the same instant, only one
-- INSERT ... ON CONFLICT can win; the loser's WHERE guard (only steal an
-- *expired* hold) fails, so it naturally continues to the next copy
-- rather than erroring.
create or replace function claim_copy_for_book(
  p_book_id uuid,
  p_station_session_id uuid,
  p_token text,
  p_ttl_seconds int default 120
) returns table (copy_id uuid, copy_accession_number text, expires_at timestamptz) as $$
declare
  candidate record;
  claimed_expires timestamptz;
begin
  for candidate in
    select bc.id, bc.accession_number from book_copies bc
    where bc.book_id = p_book_id and bc.status = 'available'
    order by bc.accession_number
  loop
    insert into soft_holds (book_copy_id, station_session_id, token, expires_at)
    values (candidate.id, p_station_session_id, p_token, now() + make_interval(secs => p_ttl_seconds))
    on conflict (book_copy_id) do update
      set station_session_id = excluded.station_session_id,
          token = excluded.token,
          attempt_count = 0,
          expires_at = excluded.expires_at
      where soft_holds.expires_at < now()
    returning soft_holds.expires_at into claimed_expires;

    if found then
      copy_id := candidate.id;
      copy_accession_number := candidate.accession_number;
      expires_at := claimed_expires;
      return next;
      return;
    end if;
  end loop;

  return; -- ran out of candidates: no copy could be claimed right now
end;
$$ language plpgsql;

-- Only this app's own backend (service_role) may call this — it bypasses
-- normal request validation (session existence, rate limiting) that
-- routers/holds.py is responsible for, so it must not be reachable with
-- just the public anon key.
revoke execute on function claim_copy_for_book(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function claim_copy_for_book(uuid, uuid, text, int) to service_role;
