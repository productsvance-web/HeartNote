-- Voice-log streaming redesign: drops the record-then-Whisper artifacts.
-- Streaming via Deepgram replaces both server-side Whisper and stored audio.
-- Pre-launch, no production data — destructive drops are acceptable.

-- 1. Drop the 3 RLS policies that scoped access to the audio_logs bucket.
-- Bucket itself + its objects are deleted out-of-band via the Supabase
-- Storage API (Postgres RLS blocks direct deletion of storage.objects).
drop policy if exists "caregiver upload audio" on storage.objects;
drop policy if exists "caregiver read audio" on storage.objects;
drop policy if exists "caregiver delete audio" on storage.objects;

-- 2. Drop the columns that only existed for the Whisper pipeline.
alter table public.daily_logs
  drop column if exists audio_storage_path,
  drop column if exists whisper_confidence;

-- 3. Collapse the processing-status enum: 'transcribing' is dead now that
-- Deepgram streams the transcript live and the server only does Claude
-- extraction. New states: pending → analyzing → complete | failed.
--
-- Postgres can't drop a single enum value, so the dance is:
--   rename type → cast column to text (intermediate) → recreate enum →
--   cast column back, mapping 'transcribing' → 'analyzing' → drop old type.

-- Drop the partial index that references the column (must come back at the end).
drop index if exists daily_logs_processing_idx;

alter type log_processing_status rename to log_processing_status_old;

create type log_processing_status as enum ('pending', 'analyzing', 'complete', 'failed');

-- Drop the default first; can't change column type while a default of the
-- old enum type is hanging on the column.
alter table public.daily_logs
  alter column processing_status drop default;

-- Cast through text: rewrite 'transcribing' rows to 'analyzing', then cast
-- the resulting text into the new enum.
alter table public.daily_logs
  alter column processing_status type log_processing_status
  using (
    case processing_status::text
      when 'transcribing' then 'analyzing'
      else processing_status::text
    end
  )::log_processing_status;

alter table public.daily_logs
  alter column processing_status set default 'pending';

drop type log_processing_status_old;

-- Rebuild the partial index on the new enum.
create index daily_logs_processing_idx on public.daily_logs(processing_status)
  where processing_status in ('pending', 'analyzing');
