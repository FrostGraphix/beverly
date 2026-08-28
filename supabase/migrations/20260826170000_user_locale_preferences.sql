begin;

create table if not exists public.user_locale_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    locale text not null default 'en' check (locale in ('en', 'yo', 'ha', 'ig')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.user_locale_preferences enable row level security;

drop policy if exists user_locale_preferences_select_own on public.user_locale_preferences;
create policy user_locale_preferences_select_own
    on public.user_locale_preferences
    for select
    to authenticated
    using (auth.uid() = user_id);

drop policy if exists user_locale_preferences_insert_own on public.user_locale_preferences;
create policy user_locale_preferences_insert_own
    on public.user_locale_preferences
    for insert
    to authenticated
    with check (auth.uid() = user_id);

drop policy if exists user_locale_preferences_update_own on public.user_locale_preferences;
create policy user_locale_preferences_update_own
    on public.user_locale_preferences
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant select, insert, update on public.user_locale_preferences to authenticated;

commit;
