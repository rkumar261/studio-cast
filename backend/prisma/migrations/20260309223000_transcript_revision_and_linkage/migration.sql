ALTER TABLE "transcript"
  ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "source_asset_id" UUID,
  ADD COLUMN IF NOT EXISTS "segment_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metadata_json" JSONB,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "idx_transcript_recording_revision"
  ON "transcript" ("recording_id", "revision");
