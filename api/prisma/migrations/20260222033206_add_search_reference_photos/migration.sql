-- CreateTable
CREATE TABLE "search_reference_photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_reference_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_faces" (
    "id" TEXT NOT NULL,
    "searchPhotoId" TEXT NOT NULL,
    "weaviateId" TEXT,
    "confidence" DOUBLE PRECISION,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "w" DOUBLE PRECISION,
    "h" DOUBLE PRECISION,

    CONSTRAINT "search_faces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_reference_photos_userId_idx" ON "search_reference_photos"("userId");

-- CreateIndex
CREATE INDEX "search_faces_searchPhotoId_idx" ON "search_faces"("searchPhotoId");

-- CreateIndex
CREATE INDEX "search_faces_weaviateId_idx" ON "search_faces"("weaviateId");

-- AddForeignKey
ALTER TABLE "search_reference_photos" ADD CONSTRAINT "search_reference_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_faces" ADD CONSTRAINT "search_faces_searchPhotoId_fkey" FOREIGN KEY ("searchPhotoId") REFERENCES "search_reference_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
