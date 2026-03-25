-- AddColumn: recording_started_at on track for P2 duration sync
ALTER TABLE "track" ADD COLUMN "recording_started_at" TIMESTAMPTZ(6);
