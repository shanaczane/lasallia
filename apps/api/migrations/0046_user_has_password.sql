-- 0046_user_has_password.sql
-- GET /auth/password-status (routers/auth.py) had no reliable way to tell
-- whether a Google sign-in account has had a password added: GoTrue's admin
-- API never exposes the password hash, the 'email' identity doesn't
-- reliably appear after admin.update_user_by_id, and the
-- app_metadata.has_password stamp only exists on passwords set after it was
-- introduced — so an account that set one earlier got the first-login
-- "Set a password" step on every page load. auth.users.encrypted_password
-- is the actual source of truth; this exposes just the yes/no.
--
-- security definer so it can read the auth schema; execute is revoked from
-- anon/authenticated so only the service-role client (get_admin_client)
-- can call it — otherwise anyone could probe any user id.
create or replace function user_has_password(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = auth, public
as $$
  select coalesce(
    (select encrypted_password is not null and encrypted_password <> ''
       from auth.users where id = uid),
    false
  );
$$;

revoke execute on function user_has_password(uuid) from public, anon, authenticated;
grant execute on function user_has_password(uuid) to service_role;
