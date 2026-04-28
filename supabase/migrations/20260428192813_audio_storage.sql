-- Audio storage bucket for voice logs.
-- Path convention: {caregiver_id}/{patient_id}/{daily_log_id}.webm
-- Bucket is private; access through RLS only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio_logs',
  'audio_logs',
  false,
  10 * 1024 * 1024,                -- 10 MB max per file (a 30-sec webm is ~150 KB; this is generous)
  array['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg']
);

-- Caregivers can upload audio under their own user-id folder.
create policy "caregiver upload audio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'audio_logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Caregivers can read their own audio.
create policy "caregiver read audio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'audio_logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Caregivers can delete their own audio (e.g., re-recording, or privacy).
create policy "caregiver delete audio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'audio_logs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Add a processing status to daily_logs so the UI can render
-- "Recording…" → "Transcribing…" → "Done" without polling for column population.
create type log_processing_status as enum ('pending', 'transcribing', 'analyzing', 'complete', 'failed');

alter table public.daily_logs
  add column processing_status log_processing_status not null default 'pending',
  add column processing_error text;

create index daily_logs_processing_idx on public.daily_logs(processing_status)
  where processing_status in ('pending', 'transcribing', 'analyzing');
