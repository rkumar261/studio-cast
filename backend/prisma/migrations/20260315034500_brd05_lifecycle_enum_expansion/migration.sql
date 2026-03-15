-- BRD/TRD 05: expand canonical lifecycle enums in a backward-safe way.
-- Existing legacy-compatible values remain valid while runtime code migrates.

DO $$
BEGIN
  ALTER TYPE "recording_lifecycle_state" ADD VALUE IF NOT EXISTS 'prejoin';
  ALTER TYPE "recording_lifecycle_state" ADD VALUE IF NOT EXISTS 'idle';
  ALTER TYPE "recording_lifecycle_state" ADD VALUE IF NOT EXISTS 'post_stop_uploading';
  ALTER TYPE "recording_lifecycle_state" ADD VALUE IF NOT EXISTS 'upload_complete';
  ALTER TYPE "recording_lifecycle_state" ADD VALUE IF NOT EXISTS 'blocked';
EXCEPTION
  WHEN undefined_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TYPE "track_lifecycle_state" ADD VALUE IF NOT EXISTS 'capture_closed';
  ALTER TYPE "track_lifecycle_state" ADD VALUE IF NOT EXISTS 'ready_for_stitch';
  ALTER TYPE "track_lifecycle_state" ADD VALUE IF NOT EXISTS 'processed';
  ALTER TYPE "track_lifecycle_state" ADD VALUE IF NOT EXISTS 'blocked';
EXCEPTION
  WHEN undefined_object THEN NULL;
END
$$;
