-- cnpt database. Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
--
-- Row level security is enabled on every table with no policies, so the public anon key can read
-- and write nothing. Only the server (service-role key, in the Vercel functions) reaches the data,
-- and the API checks who is asking before every read and write.

-- people who have signed in with Google
create table if not exists public.users (
  id          bigserial primary key,
  google_sub  text not null unique,                 -- Google's stable account id
  email       text not null unique,                 -- stored lowercase
  name        text,
  picture     text,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now(),
  last_login  timestamptz not null default now()
);

-- messages sent through the contact form; linked to an account when the sender is signed in
-- (or signs up later with the same address)
create table if not exists public.enquiries (
  id          bigserial primary key,
  user_id     bigint references public.users (id) on delete set null,
  stage       text not null check (stage in ('Pre-Seed', 'Seed Level', 'Series A', 'Series B')),
  email       text not null,                        -- stored lowercase
  message     text not null check (char_length(message) between 1 and 500),
  status      text not null default 'new' check (status in ('new', 'in_review', 'replied', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists enquiries_user_idx on public.enquiries (user_id);
create index if not exists enquiries_email_idx on public.enquiries (email);
create index if not exists enquiries_created_idx on public.enquiries (created_at desc);

-- client projects, managed on /admin and shown to the client on /account
create table if not exists public.projects (
  id          bigserial primary key,
  user_id     bigint references public.users (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  stage       text not null default 'frame' check (stage in ('frame', 'concept', 'system', 'entry')),
  status      text not null default 'active' check (status in ('active', 'paused', 'complete')),
  note        text check (char_length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists projects_user_idx on public.projects (user_id);

alter table public.users enable row level security;
alter table public.enquiries enable row level security;
alter table public.projects enable row level security;
