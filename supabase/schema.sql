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
-- (which adds fields, the focal split and consultants). Linked to an account when the sender is signed in,
-- or signs up later with the same address. Admins add the estimate.
create table if not exists public.enquiries (
  id             bigserial primary key,
  user_id        bigint references public.users (id) on delete set null,
  stage          text not null check (stage in ('Pre-Seed', 'Seed Level', 'Series A', 'Series B')),
  email          text not null,                        -- stored lowercase
  message        text not null check (char_length(message) between 1 and 500),
  status         text not null default 'new' check (status in ('new', 'in_review', 'replied', 'closed')),
  tags           text[] not null default '{}' check (cardinality(tags) <= 5),
  -- focal: % of the work for research, branding, product developing, advertising; tens adding up to 100
  focus          smallint[] check (focus is null or (cardinality(focus) = 4 and array_position(focus, null) is null
                   and focus[1] + focus[2] + focus[3] + focus[4] = 100 and least(focus[1], focus[2], focus[3], focus[4]) >= 0
                   and focus[1] % 10 = 0 and focus[2] % 10 = 0 and focus[3] % 10 = 0 and focus[4] % 10 = 0)),
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
  step           smallint not null default 1 check (step between 1 and 5),   -- where to resume
  stage          text check (stage in ('Pre-Seed', 'Seed Level', 'Series A', 'Series B')),
  brief          text check (char_length(brief) <= 500),
  enquiry_id     bigint references public.enquiries (id) on delete set null, -- a website enquiry this draft completes
  tags           text[] not null default '{}' check (cardinality(tags) <= 5),
  focus          smallint[] check (focus is null or (cardinality(focus) = 4 and array_position(focus, null) is null
                   and focus[1] + focus[2] + focus[3] + focus[4] = 100 and least(focus[1], focus[2], focus[3], focus[4]) >= 0
                   and focus[1] % 10 = 0 and focus[2] % 10 = 0 and focus[3] % 10 = 0 and focus[4] % 10 = 0)),
  consultants    text[] not null default '{}'
                 check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3),
  submitted_at   timestamptz,                                                -- first run finished
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- what happens after an enquiry: where the work is, the picture the cnpt team shares for the stage it is in,
-- and the thread beside it. One per client account.
create table if not exists public.process (
  id          bigserial primary key,
  user_id     bigint not null unique references public.users (id) on delete cascade,
  enquiry_id  bigint references public.enquiries (id) on delete set null,      -- the enquiry the work came from
  stage       text not null default 'frame' check (stage in ('frame', 'concept', 'system', 'entry')),
  headline    text check (char_length(headline) <= 120),                       -- what is happening right now
  image_path  text check (char_length(image_path) <= 300),                     -- object in the process storage bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- the thread on a client's process: the client writes as Project Owner, the cnpt team as Consultant
create table if not exists public.comments (
  id         bigserial primary key,
  owner_id   bigint not null references public.users (id) on delete cascade,   -- whose process the thread belongs to
  author_id  bigint references public.users (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_owner_idx on public.comments (owner_id, created_at);

-- meetings a client books on the calendar; the cnpt team confirms or declines
create table if not exists public.meetings (
  id         bigserial primary key,
  user_id    bigint not null references public.users (id) on delete cascade,
  starts_at  timestamptz not null,
  minutes    smallint not null default 30 check (minutes in (30, 60)),
  status     text not null default 'requested' check (status in ('requested', 'confirmed', 'declined', 'cancelled')),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_user_idx on public.meetings (user_id, starts_at);
-- Two people can ask for the same time in the same instant, and both would pass a check made in the API.
-- Postgres refuses the second one here: no two live meetings may cover the same minutes. The end of a
-- meeting is kept as its own column because an index cannot be built on "start + so many minutes".
alter table public.meetings add column if not exists ends_at timestamptz;
create or replace function public.meetings_set_end() returns trigger language plpgsql as $$
begin
  new.ends_at := new.starts_at + make_interval(mins => new.minutes);
  return new;
end $$;
drop trigger if exists meetings_end on public.meetings;
create trigger meetings_end before insert or update of starts_at, minutes on public.meetings
  for each row execute function public.meetings_set_end();
update public.meetings set ends_at = starts_at + make_interval(mins => minutes) where ends_at is null;
alter table public.meetings alter column ends_at set not null;
do $$ begin
  alter table public.meetings add constraint meetings_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at) with &&)
    where (status in ('requested', 'confirmed'));
exception when duplicate_table or duplicate_object then null;
end $$;

-- people who put their name in the talent pool (/talent). Kept so nothing is lost if email is down.
create table if not exists public.talent (
  id         bigserial primary key,
  category   text not null check (category in ('consultant', 'designer', 'engineer', 'commerce')),
  name       text not null check (char_length(name) between 1 and 120),
  email      text not null,                                                -- stored lowercase
  links      text check (char_length(links) <= 300),                       -- portfolio, LinkedIn, GitHub…
  message    text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists talent_created_idx on public.talent (created_at desc);

-- ---------- upgrades for databases created by earlier versions ----------
-- one consultant → several
alter table public.onboarding add column if not exists consultants text[] not null default '{}'
  check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3);
-- fields, consultants and the estimate moved from onboarding onto the enquiry
alter table public.enquiries add column if not exists tags text[] not null default '{}' check (cardinality(tags) <= 5);
alter table public.enquiries add column if not exists consultants text[] not null default '{}'
  check (consultants <@ array['michael', 'brandon', 'kenny']::text[] and cardinality(consultants) <= 3);
alter table public.enquiries add column if not exists estimated_cost integer check (estimated_cost between 0 and 1000000);
-- the focal split, and a fifth step (focal) in the flow
alter table public.enquiries add column if not exists focus smallint[] check (focus is null or (cardinality(focus) = 4 and array_position(focus, null) is null
                   and focus[1] + focus[2] + focus[3] + focus[4] = 100 and least(focus[1], focus[2], focus[3], focus[4]) >= 0
                   and focus[1] % 10 = 0 and focus[2] % 10 = 0 and focus[3] % 10 = 0 and focus[4] % 10 = 0));
alter table public.onboarding add column if not exists focus smallint[] check (focus is null or (cardinality(focus) = 4 and array_position(focus, null) is null
                   and focus[1] + focus[2] + focus[3] + focus[4] = 100 and least(focus[1], focus[2], focus[3], focus[4]) >= 0
                   and focus[1] % 10 = 0 and focus[2] % 10 = 0 and focus[3] % 10 = 0 and focus[4] % 10 = 0));
alter table public.onboarding drop constraint if exists onboarding_step_check;
alter table public.onboarding add constraint onboarding_step_check check (step between 1 and 5);
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
alter table public.process enable row level security;
alter table public.comments enable row level security;
alter table public.meetings enable row level security;
alter table public.talent enable row level security;
