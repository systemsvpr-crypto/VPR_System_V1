create table public.users (
  user_id uuid not null default gen_random_uuid (),
  full_name text not null,
  designation text null,
  date_of_birth date null,
  gender text null,
  email text null,
  phone_number text null,
  current_address text null,
  username text not null,
  password_hash text not null,
  role text null,
  is_active boolean null default true,
  profile_picture text null,
  page_access text[] null default '{}'::text[],
  created_at timestamp without time zone null default (now() AT TIME ZONE 'Asia/Kolkata'::text),
  constraint users_pkey primary key (user_id),
  constraint users_username_key unique (username)
) TABLESPACE pg_default;