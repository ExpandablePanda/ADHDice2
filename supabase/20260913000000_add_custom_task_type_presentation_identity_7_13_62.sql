-- 7.13.62: presentation metadata belongs to the stable named Custom Task Type identity.
-- Source-only migration. Apply separately after the implementation is deployed.
begin;

alter table public.adhdice_custom_behavior_rulesets
  add column if not exists icon_key text not null default 'list-todo',
  add column if not exists accent_key text not null default 'purple',
  add column if not exists description text not null default '';

update public.adhdice_custom_behavior_rulesets
   set icon_key = 'list-todo'
 where icon_key is null or length(btrim(icon_key)) = 0;

update public.adhdice_custom_behavior_rulesets
   set accent_key = 'purple'
 where accent_key is null or length(btrim(accent_key)) = 0;

update public.adhdice_custom_behavior_rulesets
   set description = ''
 where description is null;

alter table public.adhdice_custom_behavior_rulesets
  alter column icon_key set not null,
  alter column icon_key set default 'list-todo',
  alter column accent_key set not null,
  alter column accent_key set default 'purple',
  alter column description set not null,
  alter column description set default '';

alter table public.adhdice_custom_behavior_rulesets
  add constraint adhdice_custom_behavior_rulesets_icon_key_check
    check (length(btrim(icon_key)) between 1 and 80),
  add constraint adhdice_custom_behavior_rulesets_accent_key_check
    check (length(btrim(accent_key)) between 1 and 40),
  add constraint adhdice_custom_behavior_rulesets_description_check
    check (char_length(description) <= 240);

commit;
