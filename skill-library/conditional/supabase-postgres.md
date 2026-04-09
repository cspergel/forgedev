---
name: supabase-postgres
description: Supabase schema design, Row Level Security policies, migration patterns, real-time subscriptions, edge function patterns
when_to_use: During builds of database and API nodes in Supabase-backed projects
priority: 75
source: supabase
validated_at: "2026-04-09"
overrides: []
tier_filter: []
agent_filter: [builder]
tech_filter: [supabase]
---

# Supabase + PostgreSQL Patterns

## Schema Design

### Table Creation Pattern
```sql
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null check (char_length(title) between 1 and 255),
  content text,
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Auto-update timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger documents_updated_at
  before update on public.documents
  for each row execute function update_updated_at();
```

### Schema Checklist
- [ ] UUIDs for primary keys (gen_random_uuid(), not auto-increment)
- [ ] `auth.users(id)` as FK for user ownership (not a custom users table)
- [ ] `created_at` and `updated_at` with defaults on every table
- [ ] `on delete cascade` or `on delete set null` — never leave dangling FKs
- [ ] Check constraints for enums (not just text)
- [ ] Text fields have length constraints where appropriate
- [ ] `not null` on every field unless null is meaningful

## Row Level Security (RLS)

### RLS is MANDATORY
```sql
-- Enable RLS on every table
alter table public.documents enable row level security;

-- Default: deny all (fail-closed)
-- Then add explicit allow policies
```

### Common Policy Patterns

```sql
-- Users read own data
create policy "Users read own documents"
  on public.documents for select
  using (auth.uid() = user_id);

-- Users create own data
create policy "Users create own documents"
  on public.documents for insert
  with check (auth.uid() = user_id);

-- Users update own data
create policy "Users update own documents"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users delete own data
create policy "Users delete own documents"
  on public.documents for delete
  using (auth.uid() = user_id);

-- Admin reads all
create policy "Admins read all documents"
  on public.documents for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
```

### RLS Checklist
- [ ] RLS enabled on EVERY public table (no exceptions)
- [ ] Separate policies per operation (select, insert, update, delete)
- [ ] `using` clause for read/delete, `with check` for insert/update
- [ ] No `using (true)` unless intentionally public
- [ ] Test: user A cannot read user B's data
- [ ] Test: unauthenticated request gets zero rows, not error
- [ ] Service role key NEVER used in client code (bypasses RLS)

### RLS Anti-Patterns
- `using (true)` on a table with user data — CRITICAL
- Checking role with a text comparison instead of join to profiles — insecure
- Missing policy for a CRUD operation — that operation is blocked (good default, but test it)
- Using `auth.jwt()` claims for authorization without server-side validation

## Migration Patterns

### Migration Rules
- [ ] One logical change per migration file
- [ ] Timestamp-prefixed filenames (supabase default)
- [ ] Idempotent where possible (`create table if not exists`)
- [ ] Seed data in `supabase/seed.sql`, never in migrations
- [ ] Test with `supabase db reset` before committing

## Supabase Client Rules

- [ ] Use typed client: `createClient<Database>(url, anonKey)` with generated types
- [ ] Always check `error` before using `data`
- [ ] Use `.select()` to get modified row back, `.single()` for one row
- [ ] Never use service role key in browser code
- [ ] Generate types with `supabase gen types typescript` after every migration
- [ ] Real-time: always filter subscriptions, unsubscribe on unmount
- [ ] RLS applies to real-time (user only sees own data changes)

## Severity Guide

| Finding | Severity |
|---------|----------|
| RLS not enabled on table with user data | CRITICAL |
| Service role key in client-side code | CRITICAL |
| `using (true)` on non-public table | CRITICAL |
| Missing RLS policy for a CRUD operation (unintentional) | HIGH |
| No error handling on supabase query | HIGH |
| Manual SQL instead of migration file | MEDIUM |
| Missing type generation after schema change | MEDIUM |
| Real-time subscription without filter | LOW |
