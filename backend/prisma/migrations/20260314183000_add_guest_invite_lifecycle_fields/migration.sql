ALTER TABLE "participant"
  ADD COLUMN IF NOT EXISTS "invite_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "invite_revoked_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "invite_claimed_at" TIMESTAMPTZ(6);
