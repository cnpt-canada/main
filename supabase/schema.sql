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

-- a client's answers to the first-time onboarding flow (one row per account); admins add the estimate
create table if not exists public.onboarding (
  id             bigserial primary key,
  user_id        bigint not null unique references public.users (id) on delete cascade,
  step           smallint not null default 1 check (step between 1 and 4),   -- where to resume
  stage          text check (stage in ('Pre-Seed', 'Seed Level', 'Series A', 'Series B')),
  brief          text check (char_length(brief) <= 500),
  enquiry_id     bigint references public.enquiries (id) on delete set null, -- the enquiry it continues or created
  tags           text[] not null default '{}' check (cardinality(tags) <= 5),
  consultants    text[] not null default '{}'                                -- one or more
                 check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3),
  estimated_cost integer check (estimated_cost between 0 and 10000000),     -- CAD, set by an admin
  submitted_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- upgrade from the first version, which allowed a single `consultant`
alter table public.onboarding add column if not exists consultants text[] not null default '{}'
  check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3);
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'onboarding' and column_name = 'consultant') then
    update public.onboarding set consultants = array[consultant] where consultant is not null and cardinality(consultants) = 0;
    alter table public.onboarding drop column consultant;
  end if;
end $$;

alter table public.users enable row level security;
alter table public.enquiries enable row level security;
alter table public.onboarding enable row level security;
