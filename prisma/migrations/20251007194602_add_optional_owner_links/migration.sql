-- AlterTable
ALTER TABLE "participant" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "recording" ADD COLUMN     "userId" UUID;

-- CreateIndex
CREATE INDEX "participant_recording_id_idx" ON "participant"("recording_id");

-- CreateIndex
CREATE INDEX "idx_participant_user" ON "participant"("userId");

-- CreateIndex
CREATE INDEX "idx_recording_user" ON "recording"("userId");

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "participant" ADD CONSTRAINT "participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
