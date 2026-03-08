-- Persist canonical TUS identity on chunk rows.
ALTER TABLE "track_chunk"
  ADD COLUMN IF NOT EXISTS "tus_upload_id" TEXT,
  ADD COLUMN IF NOT EXISTS "tus_resource_url" TEXT,
  ADD COLUMN IF NOT EXISTS "tus_upload_state" TEXT;

CREATE INDEX IF NOT EXISTS "idx_track_chunk_tus_upload_id"
  ON "track_chunk" ("tus_upload_id");
