-- supabase/migrations/001_add_buckets_and_pix.sql
-- Run this in Supabase SQL Editor → New query → Run

-- 1. Add pix_key to people
alter table people
  add column if not exists pix_key text;

-- 2. Add bucket_id to transactions (nullable — null means "default Todos bucket")
alter table transactions
  add column if not exists bucket_id text;

-- 3. Create buckets table
create table if not exists buckets (
  id          text primary key,
  trip_id     text not null references trips(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);

-- 4. Create bucket_members table
create table if not exists bucket_members (
  bucket_id  text not null references buckets(id) on delete cascade,
  person_id  text not null references people(id) on delete cascade,
  primary key (bucket_id, person_id)
);

-- 5. Index for fast trip → buckets lookup
create index if not exists idx_buckets_trip_id on buckets(trip_id);
create index if not exists idx_bucket_members_bucket_id on bucket_members(bucket_id);
create index if not exists idx_transactions_bucket_id on transactions(bucket_id);
