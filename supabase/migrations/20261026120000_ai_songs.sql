-- AMPED AI studio: a log of AI requests (for the daily limits) and a public bucket for produced songs.
create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lyrics', 'song')),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_kind_created on public.ai_requests (kind, created_at);
-- only the edge function (service role) reads or writes it
alter table public.ai_requests enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai-songs', 'ai-songs', true, 20971520, array['audio/mpeg'])
on conflict (id) do nothing;
