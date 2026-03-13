# Implementation Example - Upload Search Photo

This is a **reference implementation** for the `uploadSearchPhoto` method. 
Use this as a guide to understand the pattern, then implement the other methods yourself.

## Full Implementation of uploadSearchPhoto()

```typescript
async uploadSearchPhoto(file: Express.Multer.File, userId: string) {
    this.logger.log(`Processing search photo upload for user ${userId}`);

    // Step 1: Check if user already has 3 photos
    const existingCount = await this.prisma.searchReferencePhoto.count({
        where: { userId }
    });

    if (existingCount >= this.MAX_SEARCH_PHOTOS) {
        throw new BadRequestException(
            `Maximum ${this.MAX_SEARCH_PHOTOS} search photos allowed. Please delete one before uploading.`
        );
    }

    // Step 2: Upload to MinIO
    const storageUrl = await this.minioService.uploadFile(
        file.originalname,
        file.buffer,
        file.mimetype,
    );

    // Step 3: Extract image dimensions
    let width: number | null = null;
    let height: number | null = null;
    try {
        const metadata = await sharp(file.buffer).metadata();
        width = metadata.width || null;
        height = metadata.height || null;
    } catch (error) {
        this.logger.warn('Failed to extract image dimensions:', error);
    }

    // Step 4: Create SearchReferencePhoto record
    const searchPhoto = await this.prisma.searchReferencePhoto.create({
        data: {
            userId,
            storageUrl,
            mimeType: file.mimetype,
            width,
            height,
        },
    });

    try {
        // Step 5: Detect faces with AI
        const start = Date.now();
        const faces = await this.aiService.extractFaces(file.buffer);
        const duration = (Date.now() - start) / 1000;
        this.metricsService.aiProcessingDuration.observe(
            { operation: 'extract_faces_search_reference' }, 
            duration
        );

        this.logger.log(`Detected ${faces.length} faces in search photo ${searchPhoto.id}`);

        // If no faces found, delete the photo and throw error
        if (!faces || faces.length === 0) {
            await this.prisma.searchReferencePhoto.delete({
                where: { id: searchPhoto.id }
            });
            await this.minioService.deleteFile(storageUrl);
            throw new BadRequestException('No face detected in the uploaded image');
        }

        // Record confidence scores
        faces.forEach(face => {
            if (face.det_score) {
                this.metricsService.aiConfidenceScore.observe(
                    { operation: 'detection_search' }, 
                    face.det_score
                );
            }
        });

        // Step 6: Save faces to Weaviate and DB
        const faceRecords: Prisma.SearchFaceCreateManyInput[] = [];
        
        for (const faceData of faces) {
            // Save to Weaviate first to get ID
            const weaviateId = await this.searchService.addSearchFace(
                faceData.embedding,
                searchPhoto.id,
                userId,
            );

            faceRecords.push({
                searchPhotoId: searchPhoto.id,
                weaviateId,
                confidence: faceData.det_score || null,
                x: faceData.bbox?.[0] || null,
                y: faceData.bbox?.[1] || null,
                w: faceData.bbox?.[2] || null,
                h: faceData.bbox?.[3] || null,
            });
        }

        // Batch insert all faces
        await this.prisma.searchFace.createMany({
            data: faceRecords,
        });

        this.logger.log(`Successfully saved ${faces.length} faces for search photo ${searchPhoto.id}`);

        // Step 7: Return the created photo with faces
        return await this.prisma.searchReferencePhoto.findUnique({
            where: { id: searchPhoto.id },
            include: { searchFaces: true },
        });

    } catch (error) {
        // If face processing fails, clean up the photo
        this.logger.error(`Failed to process faces for search photo ${searchPhoto.id}:`, error);
        
        // Clean up: delete from storage and database
        try {
            await this.minioService.deleteFile(storageUrl);
            await this.prisma.searchReferencePhoto.delete({
                where: { id: searchPhoto.id }
            });
        } catch (cleanupError) {
            this.logger.error('Failed to clean up after error:', cleanupError);
        }

        throw error;
    }
}
```

## Explanation of Key Parts

### 1. Checking the Limit
```typescript
const existingCount = await this.prisma.searchReferencePhoto.count({
    where: { userId }
});
```
- Uses `count()` instead of `findMany()` for efficiency
- Only need to know the number, not fetch all records

### 2. Error Handling Pattern
```typescript
try {
    // main logic
} catch (error) {
    // cleanup: delete from MinIO and database
    throw error;
}
```
- If face extraction fails, we clean up the uploaded photo
- Prevents orphaned records

### 3. Batch Insert Pattern
```typescript
const faceRecords: Prisma.SearchFaceCreateManyInput[] = [];
// ... populate array ...
await this.prisma.searchFace.createMany({ data: faceRecords });
```
- More efficient than creating faces one by one
- Single database transaction

### 4. Confidence Score Tracking
```typescript
this.metricsService.aiConfidenceScore.observe(
    { operation: 'detection_search' }, 
    face.det_score
);
```
- Helps monitor AI service quality
- Can identify if face detection is getting worse

### 5. Returning Complete Data
```typescript
return await this.prisma.searchReferencePhoto.findUnique({
    where: { id: searchPhoto.id },
    include: { searchFaces: true },
});
```
- Returns the photo WITH all its faces
- Frontend gets complete data in one response

---

## Now Implement the Controller Endpoint

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadSearchPhoto(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
) {
    // TODO: Validate file exists
    if (!file) {
        throw new BadRequestException('File is required');
    }

    // TODO: Validate file is an image
    if (!file.mimetype.startsWith('image/')) {
        throw new BadRequestException('Only image files are allowed');
    }

    // TODO: Get userId from authenticated user
    const userId = req.user.id;

    // TODO: Call service method
    const result = await this.searchReferencePhotosService.uploadSearchPhoto(file, userId);

    // TODO: Return success response
    return {
        message: 'Search photo uploaded successfully',
        data: result,
    };
}
```

---

## Pattern for Other Methods

### getUserSearchPhotos (Simple Read)
```typescript
async getUserSearchPhotos(userId: string) {
    return await this.prisma.searchReferencePhoto.findMany({
        where: { userId },
        include: { searchFaces: true },
        orderBy: { createdAt: 'desc' },
    });
}
```

### deleteSearchPhoto (Delete with Cleanup)
```typescript
async deleteSearchPhoto(id: string, userId: string) {
    // 1. Find and verify ownership
    const photo = await this.prisma.searchReferencePhoto.findUnique({
        where: { id },
        include: { searchFaces: true },
    });

    if (!photo) {
        throw new NotFoundException('Search photo not found');
    }

    if (photo.userId !== userId) {
        throw new NotFoundException('Search photo not found');
    }

    // 2. Delete faces from Weaviate
    for (const face of photo.searchFaces) {
        if (face.weaviateId) {
            try {
                await this.searchService.deleteFace(face.weaviateId);
            } catch (error) {
                this.logger.warn(`Failed to delete face ${face.weaviateId} from Weaviate:`, error);
            }
        }
    }

    // 3. Delete from MinIO
    try {
        await this.minioService.deleteFile(photo.storageUrl);
    } catch (error) {
        this.logger.warn(`Failed to delete file from MinIO:`, error);
    }

    // 4. Delete from database (cascade handles searchFaces)
    await this.prisma.searchReferencePhoto.delete({
        where: { id }
    });

    return { message: 'Search photo deleted successfully' };
}
```

---

## Testing Checklist

- [ ] Upload works with valid face photo
- [ ] Upload rejects photo with no face
- [ ] Upload rejects when user has 3 photos
- [ ] Upload rejects non-image files
- [ ] List returns user's photos only
- [ ] Delete removes photo, faces, and storage
- [ ] Delete fails if photo belongs to different user
- [ ] Replace removes old and creates new

Good luck! 🚀
