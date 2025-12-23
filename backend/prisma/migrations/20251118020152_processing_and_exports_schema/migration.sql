-- CreateEnum
CREATE TYPE "export_type" AS ENUM ('wav', 'mp4', 'mp4_captions');

-- CreateEnum
CREATE TYPE "export_state" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "track" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "transcript_segment" ADD COLUMN     "track_id" UUID;

-- CreateTable
CREATE TABLE "export_artifact" (
    "id" UUID NOT NULL,
    "recording_id" UUID NOT NULL,
    "type" "export_type" NOT NULL,
    "state" "export_state" NOT NULL DEFAULT 'queued',
    "storage_key" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "export_artifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_export_recording" ON "export_artifact"("recording_id");

-- CreateIndex
CREATE INDEX "idx_transcript_track" ON "transcript_segment"("track_id");

-- AddForeignKey
ALTER TABLE "transcript_segment" ADD CONSTRAINT "transcript_segment_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "track"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "export_artifact" ADD CONSTRAINT "export_artifact_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
