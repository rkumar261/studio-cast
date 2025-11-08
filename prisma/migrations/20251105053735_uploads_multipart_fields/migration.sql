-- DropForeignKey
ALTER TABLE "public"."upload" DROP CONSTRAINT "upload_track_id_fkey";

-- AlterTable
ALTER TABLE "upload" ADD COLUMN     "completion_sig" TEXT,
ADD COLUMN     "expected_size" BIGINT,
ADD COLUMN     "multipart_id" TEXT,
ADD COLUMN     "object_key" TEXT,
ADD COLUMN     "part_size" INTEGER,
ADD COLUMN     "storage_bucket" TEXT;

-- CreateIndex
CREATE INDEX "idx_upload_state_updated" ON "upload"("state", "updated_at");

-- AddForeignKey
ALTER TABLE "upload" ADD CONSTRAINT "upload_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
