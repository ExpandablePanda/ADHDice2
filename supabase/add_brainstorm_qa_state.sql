alter table public.adhdice_brainstorm_state
  add column if not exists qa_state jsonb not null
  default '{"schemaVersion":1,"activeSessionId":null,"sessions":[]}'::jsonb;

alter table public.adhdice_brainstorm_state
  drop constraint if exists adhdice_brainstorm_state_qa_state_object;

alter table public.adhdice_brainstorm_state
  add constraint adhdice_brainstorm_state_qa_state_object
  check (jsonb_typeof(qa_state) = 'object');
