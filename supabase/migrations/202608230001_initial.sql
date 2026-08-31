create extension if not exists pgcrypto;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  locale text not null default 'zh-CN' check (locale in ('zh-CN', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experiment_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  experiment jsonb not null,
  analysis_config jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_id uuid not null references public.experiment_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  result jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.qc_decisions (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.experiment_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  well_id text not null,
  decision text not null check (decision in ('accepted', 'excluded')),
  reason text not null,
  decided_at timestamptz not null default now()
);

create table public.artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create table public.guest_analysis_jobs (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'succeeded' check (status in ('succeeded', 'failed')),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index projects_user_idx on public.projects(user_id, updated_at desc);
create index versions_project_idx on public.experiment_versions(project_id, version desc);
create index jobs_user_idx on public.analysis_jobs(user_id, created_at desc);
create index artifacts_job_idx on public.artifacts(job_id);
create index guest_jobs_expiry_idx on public.guest_analysis_jobs(expires_at);

create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;
alter table public.experiment_versions enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.qc_decisions enable row level security;
alter table public.artifacts enable row level security;
alter table public.guest_analysis_jobs enable row level security;

create policy projects_owner_all on public.projects
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy versions_owner_all on public.experiment_versions
for all to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  )
);

create policy jobs_owner_all on public.analysis_jobs
for all to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ) and exists (
    select 1 from public.experiment_versions v
    where v.id = version_id
      and v.project_id = project_id
      and v.user_id = (select auth.uid())
  )
);

create policy qc_owner_all on public.qc_decisions
for all to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.experiment_versions v
    where v.id = version_id and v.user_id = (select auth.uid())
  )
);

create policy artifacts_owner_all on public.artifacts
for all to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.analysis_jobs j
    where j.id = job_id and j.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values ('analysis-artifacts', 'analysis-artifacts', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;

create policy artifact_files_owner_select on storage.objects
for select to authenticated using (
  bucket_id = 'analysis-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy artifact_files_owner_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'analysis-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy artifact_files_owner_update on storage.objects
for update to authenticated using (
  bucket_id = 'analysis-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
) with check (
  bucket_id = 'analysis-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy artifact_files_owner_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'analysis-artifacts' and (storage.foldername(name))[1] = (select auth.uid())::text
);

revoke all on all tables in schema public from anon;
revoke all on public.guest_analysis_jobs from authenticated;
grant select, insert, delete on public.guest_analysis_jobs to service_role;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.experiment_versions to authenticated;
grant select, insert, update, delete on public.analysis_jobs to authenticated;
grant select, insert, update, delete on public.qc_decisions to authenticated;
grant select, insert, update, delete on public.artifacts to authenticated;
