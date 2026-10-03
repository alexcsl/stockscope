create schema if not exists stockscope;
revoke all on schema stockscope from public, anon, authenticated;
create table stockscope.state (
  owner text not null,
  name text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, name),
  check (octet_length(value::text) <= 2097152)
);
alter table stockscope.state enable row level security;
revoke all on stockscope.state from public, anon, authenticated;
