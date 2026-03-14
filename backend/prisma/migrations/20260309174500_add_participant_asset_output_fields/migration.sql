ALTER TABLE "participant_asset"
  ADD COLUMN IF NOT EXISTS "preview_key" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata_json" JSONB,
  ADD COLUMN IF NOT EXISTS "export_set_json" JSONB;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY recording_id, participant_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS row_num
  FROM "participant_asset"
)
DELETE FROM "participant_asset" pa
USING ranked r
WHERE pa.id = r.id
  AND r.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_participant_asset_recording_participant"
  ON "participant_asset" ("recording_id", "participant_id");
