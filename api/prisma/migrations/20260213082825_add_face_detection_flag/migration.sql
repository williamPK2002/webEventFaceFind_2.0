-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "hasFaceDetected" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "photos_hasFaceDetected_idx" ON "photos"("hasFaceDetected");
