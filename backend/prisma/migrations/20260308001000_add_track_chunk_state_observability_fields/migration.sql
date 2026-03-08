ALTER TABLE "track_chunk"
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "last_error_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "materialized_at" TIMESTAMPTZ(6);
