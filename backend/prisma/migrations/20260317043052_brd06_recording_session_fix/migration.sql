-- AlterTable
ALTER TABLE "combined_asset" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "job" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "participant_asset" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recording" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "track" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "transcript" ALTER COLUMN "updated_at" DROP DEFAULT;
