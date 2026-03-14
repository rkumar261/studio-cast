ALTER TABLE "combined_asset"
  ADD COLUMN IF NOT EXISTS "preview_key" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata_json" JSONB,
  ADD COLUMN IF NOT EXISTS "export_set_json" JSONB;
