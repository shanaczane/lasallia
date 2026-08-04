-- 0007_fix_claim_function_ambiguity.sql
-- Fixes a bug in 0006's claim_copy_for_book: the OUT parameter named
-- `accession_number` collided with the book_copies.accession_number
-- column referenced inside the function body ("column reference
-- accession_number is ambiguous"), so every call failed. Renamed the OUT
-- parameter to copy_accession_number and qualified all column references
-- with a table alias. CREATE OR REPLACE can't change a function's return
-- type, so this has to drop it first.

drop function if exists claim_copy_for_book(uuid, uuid, text, int);

create function claim_copy_for_book(
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

  return;
end;
$$ language plpgsql;

revoke execute on function claim_copy_for_book(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function claim_copy_for_book(uuid, uuid, text, int) to service_role;
