-- /log redesign: apply_log_patch_v2 RPC for tap-session UPSERTs.
--
-- Distinct from apply_voice_log_extraction:
--  - Voice path APPENDS (one transcript = one set of new rows; never
--    deletes prior data on the same log_id).
--  - Tap-session path REPLACES (each save is the full snapshot of the
--    session; readings + events for source_log_id = p_log_id are deleted
--    first, then re-inserted).
--
-- Two RPCs, two semantics, named distinctly. RLS scopes both deletes and
-- inserts to the caller's patient via the existing daily_logs / readings /
-- events policies (security invoker — no privilege escalation).

create or replace function public.apply_log_patch_v2(
  p_log_id uuid,
  p_readings jsonb,
  p_symptom_events jsonb,
  p_day_level jsonb
) returns void
language plpgsql
security invoker
as $$
declare
  v_patient_id uuid;
  v_log_date date;
begin
  select patient_id, log_date into strict v_patient_id, v_log_date
  from public.daily_logs
  where id = p_log_id;

  -- REPLACE semantics: clear this session's prior readings + events first.
  delete from public.daily_log_readings where source_log_id = p_log_id;
  delete from public.daily_log_symptom_events where source_log_id = p_log_id;

  if jsonb_array_length(coalesce(p_readings, '[]'::jsonb)) > 0 then
    insert into public.daily_log_readings (
      patient_id, log_date, field, value, source_log_id
    )
    select v_patient_id,
           v_log_date,
           (r->>'field')::text,
           (r->>'value')::numeric,
           p_log_id
    from jsonb_array_elements(p_readings) as r;
  end if;

  if jsonb_array_length(coalesce(p_symptom_events, '[]'::jsonb)) > 0 then
    insert into public.daily_log_symptom_events (
      patient_id, log_date, symptom, present, severity, body_region,
      nocturnal, sputum_color, chest_pain_character, resolves_overnight,
      postural, source_log_id
    )
    select v_patient_id,
           v_log_date,
           (e->>'symptom')::text,
           (e->>'present')::boolean,
           nullif(e->>'severity','')::smallint,
           nullif(e->>'body_region',''),
           nullif(e->>'nocturnal','')::boolean,
           nullif(e->>'sputum_color',''),
           nullif(e->>'chest_pain_character',''),
           nullif(e->>'resolves_overnight','')::boolean,
           nullif(e->>'postural','')::boolean,
           p_log_id
    from jsonb_array_elements(p_symptom_events) as e;
  end if;

  -- Day-level fields. Coalesce so an omitted key preserves the prior value
  -- (R14: voice still sets activity_step_change; the tap modal omits it).
  update public.daily_logs
  set
    appetite_change      = coalesce(nullif(p_day_level->>'appetite_change',''),      appetite_change),
    urine_output_change  = coalesce(nullif(p_day_level->>'urine_output_change',''),  urine_output_change),
    activity_step_change = coalesce(nullif(p_day_level->>'activity_step_change',''), activity_step_change),
    notes                = coalesce(nullif(p_day_level->>'notes',''),                notes)
  where id = p_log_id;
end;
$$;

grant execute on function public.apply_log_patch_v2(uuid, jsonb, jsonb, jsonb) to authenticated;
