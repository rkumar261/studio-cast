-- Canonical lifecycle alignment from BRD/TRD Task 02.
-- Additive + backward-safe: legacy status/state fields remain in place.

DO $$
BEGIN
  CREATE TYPE "recording_lifecycle_state" AS ENUM (
    'created',
    'preparing',
    'recording',
    'stopping',
    'uploading',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "track_lifecycle_state" AS ENUM (
    'registered',
    'recording',
    'finalized',
    'ingest_ready',
    'stitched',
    'transcoded',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "asset_state" AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "transcript_state" AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "recording"
  ADD COLUMN IF NOT EXISTS "lifecycle_state" "recording_lifecycle_state" NOT NULL DEFAULT 'created',
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "upload_completed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "processing_started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "ready_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;

CREATE INDEX IF NOT EXISTS "idx_recording_lifecycle_updated"
  ON "recording" ("lifecycle_state", "updated_at");

ALTER TABLE "track"
  ADD COLUMN IF NOT EXISTS "lifecycle_state" "track_lifecycle_state" NOT NULL DEFAULT 'registered',
  ADD COLUMN IF NOT EXISTS "finalized_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "ingest_ready_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "stitched_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "transcoded_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "ready_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "idx_track_lifecycle_updated"
  ON "track" ("lifecycle_state", "updated_at");

ALTER TABLE "track_chunk"
  ADD COLUMN IF NOT EXISTS "uploaded_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ(6);

ALTER TABLE "job"
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "participant_asset" (
  "id" UUID NOT NULL,
  "recording_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "state" "asset_state" NOT NULL DEFAULT 'pending',
  "storage_key" TEXT,
  "duration_ms" INTEGER,
  "resolution" TEXT,
  "processing_started_at" TIMESTAMPTZ(6),
  "ready_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "participant_asset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_participant_asset_recording"
  ON "participant_asset" ("recording_id");
CREATE INDEX IF NOT EXISTS "idx_participant_asset_participant"
  ON "participant_asset" ("participant_id");
CREATE INDEX IF NOT EXISTS "idx_participant_asset_state_updated"
  ON "participant_asset" ("state", "updated_at");

CREATE TABLE IF NOT EXISTS "combined_asset" (
  "id" UUID NOT NULL,
  "recording_id" UUID NOT NULL,
  "state" "asset_state" NOT NULL DEFAULT 'pending',
  "storage_key" TEXT,
  "duration_ms" INTEGER,
  "resolution" TEXT,
  "processing_started_at" TIMESTAMPTZ(6),
  "ready_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "combined_asset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_combined_asset_recording"
  ON "combined_asset" ("recording_id");
CREATE INDEX IF NOT EXISTS "idx_combined_asset_state_updated"
  ON "combined_asset" ("state", "updated_at");

CREATE TABLE IF NOT EXISTS "transcript" (
  "id" UUID NOT NULL,
  "recording_id" UUID NOT NULL,
  "track_id" UUID,
  "state" "transcript_state" NOT NULL DEFAULT 'pending',
  "language" TEXT,
  "storage_key" TEXT,
  "processing_started_at" TIMESTAMPTZ(6),
  "ready_at" TIMESTAMPTZ(6),
  "failed_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "transcript_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_transcript_row_recording"
  ON "transcript" ("recording_id");
CREATE INDEX IF NOT EXISTS "idx_transcript_row_track"
  ON "transcript" ("track_id");
CREATE INDEX IF NOT EXISTS "idx_transcript_state_updated"
  ON "transcript" ("state", "updated_at");

ALTER TABLE "transcript_segment"
  ADD COLUMN IF NOT EXISTS "transcript_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_transcript_segment_transcript"
  ON "transcript_segment" ("transcript_id");

ALTER TABLE "export_artifact"
  ADD COLUMN IF NOT EXISTS "participant_asset_id" UUID,
  ADD COLUMN IF NOT EXISTS "combined_asset_id" UUID,
  ADD COLUMN IF NOT EXISTS "transcript_id" UUID,
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "ready_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;

CREATE INDEX IF NOT EXISTS "idx_export_participant_asset"
  ON "export_artifact" ("participant_asset_id");
CREATE INDEX IF NOT EXISTS "idx_export_combined_asset"
  ON "export_artifact" ("combined_asset_id");
CREATE INDEX IF NOT EXISTS "idx_export_transcript"
  ON "export_artifact" ("transcript_id");
CREATE INDEX IF NOT EXISTS "idx_export_state_updated"
  ON "export_artifact" ("state", "updated_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participant_asset_recording_id_fkey'
  ) THEN
    ALTER TABLE "participant_asset"
      ADD CONSTRAINT "participant_asset_recording_id_fkey"
      FOREIGN KEY ("recording_id") REFERENCES "recording"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'participant_asset_participant_id_fkey'
  ) THEN
    ALTER TABLE "participant_asset"
      ADD CONSTRAINT "participant_asset_participant_id_fkey"
      FOREIGN KEY ("participant_id") REFERENCES "participant"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'combined_asset_recording_id_fkey'
  ) THEN
    ALTER TABLE "combined_asset"
      ADD CONSTRAINT "combined_asset_recording_id_fkey"
      FOREIGN KEY ("recording_id") REFERENCES "recording"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transcript_recording_id_fkey'
  ) THEN
    ALTER TABLE "transcript"
      ADD CONSTRAINT "transcript_recording_id_fkey"
      FOREIGN KEY ("recording_id") REFERENCES "recording"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transcript_track_id_fkey'
  ) THEN
    ALTER TABLE "transcript"
      ADD CONSTRAINT "transcript_track_id_fkey"
      FOREIGN KEY ("track_id") REFERENCES "track"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transcript_segment_transcript_id_fkey'
  ) THEN
    ALTER TABLE "transcript_segment"
      ADD CONSTRAINT "transcript_segment_transcript_id_fkey"
      FOREIGN KEY ("transcript_id") REFERENCES "transcript"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'export_artifact_participant_asset_id_fkey'
  ) THEN
    ALTER TABLE "export_artifact"
      ADD CONSTRAINT "export_artifact_participant_asset_id_fkey"
      FOREIGN KEY ("participant_asset_id") REFERENCES "participant_asset"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'export_artifact_combined_asset_id_fkey'
  ) THEN
    ALTER TABLE "export_artifact"
      ADD CONSTRAINT "export_artifact_combined_asset_id_fkey"
      FOREIGN KEY ("combined_asset_id") REFERENCES "combined_asset"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'export_artifact_transcript_id_fkey'
  ) THEN
    ALTER TABLE "export_artifact"
      ADD CONSTRAINT "export_artifact_transcript_id_fkey"
      FOREIGN KEY ("transcript_id") REFERENCES "transcript"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END
$$;
