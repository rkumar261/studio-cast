-- CreateTable
CREATE TABLE "upload_tus_map" (
    "upload_id" UUID NOT NULL,
    "tus_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "upload_tus_map_pkey" PRIMARY KEY ("upload_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upload_tus_map_tus_id_key" ON "upload_tus_map"("tus_id");

-- AddForeignKey
ALTER TABLE "upload_tus_map" ADD CONSTRAINT "upload_tus_map_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
