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

-- enquiries: from the contact form on the site, or from the step-by-step flow in the workspace
-- (which adds fields and consultants). Linked to an account when the sender is signed in, or signs up
-- later with the same address. Admins add the estimate.
create table if not exists public.enquiries (
  id             bigserial primary key,
  user_id        bigint references public.users (id) on delete set null,
  stage          text not null check (stage in ('Pre-Seed', 'Seed Level', 'Series A', 'Series B')),
  email          text not null,                        -- stored lowercase
  message        text not null check (char_length(message) between 1 and 500),
  status         text not null default 'new' check (status in ('new', 'in_review', 'replied', 'closed')),
  tags           text[] not null default '{}' check (cardinality(tags) <= 5),
  consultants    text[] not null default '{}'
                 check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3),
  estimated_cost integer check (estimated_cost between 0 and 1000000),      -- whole CAD, set by an admin
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists enquiries_user_idx on public.enquiries (user_id);
create index if not exists enquiries_email_idx on public.enquiries (email);
create index if not exists enquiries_created_idx on public.enquiries (created_at desc);

-- the step-by-step enquiry flow, one row per account: the draft being filled in (saved at every step,
-- cleared once it is sent) and when the account finished its first run (onboarding)
create table if not exists public.onboarding (
  id             bigserial primary key,
  user_id        bigint not null unique references public.users (id) on delete cascade,
  step           smallint not null default 1 check (step between 1 and 4),   -- where to resume
  stage          text check (stage in ('Pre-Seed', 'Seed Level', 'Series A', 'Series B')),
  brief          text check (char_length(brief) <= 500),
  enquiry_id     bigint references public.enquiries (id) on delete set null, -- a website enquiry this draft completes
  tags           text[] not null default '{}' check (cardinality(tags) <= 5),
  consultants    text[] not null default '{}'
                 check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3),
  submitted_at   timestamptz,                                                -- first run finished
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- upgrades for databases created by earlier versions ----------
-- one consultant → several
alter table public.onboarding add column if not exists consultants text[] not null default '{}'
  check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3);
-- fields, consultants and the estimate moved from onboarding onto the enquiry
alter table public.enquiries add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 5);
alter table public.enquiries add column if not exists consultants text[] not null default '{}'
  check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3);
alter table public.enquiries add column if not exists estimated_cost integer check (estimated_cost between 0 and 1000000);
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'onboarding' and column_name = 'consultant') then
    update public.onboarding set consultants = array[consultant] where consultant is not null and cardinality(consultants) = 0;
    alter table public.onboarding drop column consultant;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'onboarding' and column_name = 'estimated_cost') then
    update public.enquiries e set tags = o.tags, consultants = o.consultants,
           estimated_cost = coalesce(e.estimated_cost, least(o.estimated_cost, 1000000))
      from public.onboarding o
     where o.enquiry_id = e.id and o.submitted_at is not null and cardinality(e.consultants) = 0;
    -- a finished run no longer keeps its answers as a draft
    update public.onboarding set step = 1, stage = null, brief = null, enquiry_id = null, tags = '{}', consultants = '{}'
     where submitted_at is not null;
    alter table public.onboarding drop column estimated_cost;
  end if;
end $$;

alter table public.users enable row level security;
alter table public.enquiries enable row level security;
alter table public.onboarding enable row level security;
