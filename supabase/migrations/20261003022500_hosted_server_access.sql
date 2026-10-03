do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'stockscope_server') then
    create role stockscope_server nologin;
  end if;
end $$;
grant usage on schema stockscope to stockscope_server;
grant select, insert, update, delete on stockscope.state to stockscope_server;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'stockscope' and tablename = 'state' and policyname = 'server_access') then
    create policy server_access on stockscope.state for all to stockscope_server using (true) with check (true);
  end if;
end $$;
