-- Run this file in the Supabase SQL Editor before using the app.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'employee' check (role in ('employee', 'management')),
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text,
  file_path text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.document_assignments (
  document_id uuid not null references public.documents (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (document_id, employee_id)
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  signature_text text not null check (char_length(signature_text) between 1 and 200),
  signed_file_path text not null,
  signed_at timestamptz not null default now(),
  unique (document_id, employee_id)
);

create index if not exists document_assignments_employee_id_idx on public.document_assignments (employee_id);
create index if not exists signatures_document_id_idx on public.signatures (document_id);

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, delete on public.document_assignments to authenticated;
grant select, insert on public.signatures to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'management'
  );
$$;

create or replace function public.is_assigned_to(target_document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_assignments
    where document_id = target_document and employee_id = (select auth.uid())
  );
$$;

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_assignments enable row level security;
alter table public.signatures enable row level security;

drop policy if exists "Users can read their own profile and management can read all" on public.profiles;
create policy "Users can read their own profile and management can read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_management()));

drop policy if exists "Management can create documents" on public.documents;
create policy "Management can create documents"
  on public.documents for insert to authenticated
  with check ((select public.is_management()) and created_by = (select auth.uid()));
drop policy if exists "Management can update documents" on public.documents;
create policy "Management can update documents"
  on public.documents for update to authenticated
  using ((select public.is_management()))
  with check ((select public.is_management()));
drop policy if exists "Management can delete documents" on public.documents;
create policy "Management can delete documents"
  on public.documents for delete to authenticated
  using ((select public.is_management()));
drop policy if exists "Management and assigned employees can read documents" on public.documents;
create policy "Management and assigned employees can read documents"
  on public.documents for select to authenticated
  using ((select public.is_management()) or (select public.is_assigned_to(id)));

drop policy if exists "Management can assign documents" on public.document_assignments;
create policy "Management can assign documents"
  on public.document_assignments for insert to authenticated
  with check (
    (select public.is_management())
    and exists (select 1 from public.profiles where id = employee_id and role = 'employee')
  );
drop policy if exists "Management can remove assignments" on public.document_assignments;
create policy "Management can remove assignments"
  on public.document_assignments for delete to authenticated
  using ((select public.is_management()));
drop policy if exists "Management and assignees can read assignments" on public.document_assignments;
create policy "Management and assignees can read assignments"
  on public.document_assignments for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_management()));

drop policy if exists "Employees can submit their own assigned signature" on public.signatures;
create policy "Employees can submit their own assigned signature"
  on public.signatures for insert to authenticated
  with check (
    employee_id = (select auth.uid())
    and (select public.is_assigned_to(document_id))
    and exists (select 1 from public.profiles where id = employee_id and role = 'employee')
    and signed_file_path = document_id::text || '/' || employee_id::text || '.pdf'
  );
drop policy if exists "Management and signers can read signatures" on public.signatures;
create policy "Management and signers can read signatures"
  on public.signatures for select to authenticated
  using (employee_id = (select auth.uid()) or (select public.is_management()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 20971520, array['application/pdf']),
  ('signed-documents', 'signed-documents', false, 31457280, array['application/pdf'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Management can upload original PDFs" on storage.objects;
create policy "Management can upload original PDFs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select public.is_management()));
drop policy if exists "Management can update original PDFs" on storage.objects;
create policy "Management can update original PDFs"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (select public.is_management()))
  with check (bucket_id = 'documents' and (select public.is_management()));
drop policy if exists "Management can delete original PDFs" on storage.objects;
create policy "Management can delete original PDFs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (select public.is_management()));
drop policy if exists "Management and assigned employees can read original PDFs" on storage.objects;
create policy "Management and assigned employees can read original PDFs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select public.is_management())
      or exists (
        select 1 from public.document_assignments a
        where a.document_id::text || '.pdf' = name and a.employee_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Employees can upload their assigned signed PDFs" on storage.objects;
create policy "Employees can upload their assigned signed PDFs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'signed-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'employee'
    )
    and exists (
      select 1 from public.document_assignments a
      where name = a.document_id::text || '/' || (select auth.uid())::text || '.pdf'
        and a.employee_id = (select auth.uid())
    )
  );
drop policy if exists "Employees can remove an unsubmitted signed PDF" on storage.objects;
create policy "Employees can remove an unsubmitted signed PDF"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'signed-documents'
    and exists (
      select 1 from public.document_assignments a
      join public.profiles p on p.id = a.employee_id
      where name = a.document_id::text || '/' || (select auth.uid())::text || '.pdf'
        and a.employee_id = (select auth.uid())
        and p.role = 'employee'
    )
    and not exists (
      select 1 from public.signatures s where s.signed_file_path = name
    )
  );
drop policy if exists "Management and signers can read signed PDFs" on storage.objects;
create policy "Management and signers can read signed PDFs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'signed-documents'
    and (
      (select public.is_management())
      or exists (
        select 1 from public.signatures s
        where s.signed_file_path = name and s.employee_id = (select auth.uid())
      )
    )
  );

-- Promote a trusted account to management after it has signed up:
-- update public.profiles set role = 'management'
-- where id = (select id from auth.users where email = 'admin@company.com');
