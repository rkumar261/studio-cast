-- CreateEnum
CREATE TYPE "track_chunk_state" AS ENUM ('initiated', 'uploading', 'uploaded', 'failed');

-- CreateTable
CREATE TABLE "track_chunk" (
    "id" UUID NOT NULL,
    "track_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "protocol" TEXT,
    "state" "track_chunk_state" NOT NULL DEFAULT 'initiated',
    "bytes_received" BIGINT NOT NULL DEFAULT 0,
    "bytes_expected" BIGINT,
    "storage_key_raw" TEXT,
    "etag" TEXT,
    "checksum_sha256" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "track_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_track_chunk_track_seq" ON "track_chunk"("track_id", "seq");

-- CreateIndex
CREATE INDEX "idx_track_chunk_track" ON "track_chunk"("track_id");

-- CreateIndex
CREATE INDEX "idx_track_chunk_state_updated" ON "track_chunk"("state", "updated_at");

-- AddForeignKey
ALTER TABLE "track_chunk" ADD CONSTRAINT "track_chunk_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
