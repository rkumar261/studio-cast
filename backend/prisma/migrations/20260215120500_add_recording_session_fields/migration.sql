-- Add recording session control fields
ALTER TABLE "recording"
ADD COLUMN "started_at" TIMESTAMPTZ(6),
ADD COLUMN "stopped_at" TIMESTAMPTZ(6),
ADD COLUMN "host_participant_id" UUID,
ADD COLUMN "control_version" INTEGER NOT NULL DEFAULT 0;

-- Helpful lookup index for host control joins/checks
CREATE INDEX "idx_recording_host_participant" ON "recording"("host_participant_id");

-- Optional host participant link
ALTER TABLE "recording"
ADD CONSTRAINT "recording_host_participant_id_fkey"
FOREIGN KEY ("host_participant_id")
REFERENCES "participant"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;
