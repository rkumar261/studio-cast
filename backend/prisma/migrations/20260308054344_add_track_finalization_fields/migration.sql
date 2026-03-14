-- AlterTable
ALTER TABLE "track" ADD COLUMN     "capture_closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "final_seq" INTEGER,
ADD COLUMN     "finalize_requested_at" TIMESTAMPTZ(6);
