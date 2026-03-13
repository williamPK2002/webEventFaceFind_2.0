# Search Reference Photos - Implementation Guide

## Overview
This feature allows users to upload up to 3 personal photos for face search that persist across sessions. These photos are stored separately from event photos and can be used to search across all events.

## What's Been Done

### 1. Database Layer ✅
- **Prisma Schema Updated** ([schema.prisma](api/prisma/schema.prisma))
  - Added `SearchReferencePhoto` model - stores uploaded search photos
  - Added `SearchFace` model - stores face embeddings and bounding boxes
  - Updated `User` model with `searchReferencePhotos` relationship
  - Migration created and applied: `20260222033206_add_search_reference_photos`

### 2. NestJS Module Structure ✅
- **Module**: [search-reference-photos.module.ts](api/src/search-reference-photos/search-reference-photos.module.ts)
  - Imports: PrismaModule, MinioModule, AiModule, SearchModule, MetricsModule
  - Exports: SearchReferencePhotosService (for use in other modules)

- **App Module Updated**: [app.module.ts](api/src/app.module.ts)
  - SearchReferencePhotosModule added to imports

### 3. Search Service Updates ✅
- **Updated Schema** ([search.service.ts](api/src/search/search.service.ts))
  - Added `sourceType` field (values: 'event' or 'search')
  - Added `userId` field (for search photos)
  - Existing event photos will work (fields are optional in Weaviate)

## What You Need to Implement

### 🔨 File 1: search-reference-photos.service.ts

#### Method 1: `uploadSearchPhoto(file, userId)`
**Purpose**: Upload and process a new search reference photo

**Steps**:
1. Check user doesn't exceed 3 photos limit
2. Upload file to MinIO
3. Extract image metadata (width, height)
4. Create SearchReferencePhoto record
5. Extract faces using AI service
6. Save faces to Weaviate AND database
7. Return created photo with faces

**Key Concepts**:
- Use `prisma.searchReferencePhoto.count()` to check limit
- Use `this.minioService.uploadFile()` for storage
- Use `this.aiService.extractFaces()` for face detection
- Use `this.searchService.addSearchFace()` for Weaviate
- Use `prisma.searchFace.createMany()` for batch insert

#### Method 2: `getUserSearchPhotos(userId)`
**Purpose**: Get all search photos for a user

**Steps**:
1. Query with `prisma.searchReferencePhoto.findMany()`
2. Filter by userId
3. Include searchFaces relation
4. Order by createdAt DESC

#### Method 3: `deleteSearchPhoto(id, userId)`
**Purpose**: Delete a search photo

**Steps**:
1. Find photo and verify ownership
2. Get all SearchFace records
3. Delete each face from Weaviate
4. Delete file from MinIO
5. Delete from database (cascades handle relations)

**Key Concepts**:
- Use `this.searchService.deleteFace(weaviateId)` for each face
- Use `this.minioService.deleteFile(storageUrl)`
- Cascade deletes will handle SearchFace records

#### Method 4: `replaceSearchPhoto(id, file, userId)`
**Purpose**: Replace an existing search photo

**Steps**:
1. Call `deleteSearchPhoto()`
2. Call `uploadSearchPhoto()`
3. Return new photo

**Bonus**: Could use Prisma transaction for atomicity

#### Method 5: `getSearchPhotoById(id, userId)`
**Purpose**: Get single search photo with authorization

**Steps**:
1. Find with `prisma.searchReferencePhoto.findUnique()`
2. Include searchFaces
3. Verify userId matches
4. Return photo or throw NotFoundException

---

### 🔨 File 2: search-reference-photos.controller.ts

#### Endpoint 1: `POST /upload`
- Validate file exists and is an image
- Extract userId from `req.user.id`
- Call `uploadSearchPhoto()`
- Return created photo

#### Endpoint 2: `GET /`
- Extract userId from `req.user.id`
- Call `getUserSearchPhotos()`
- Return array of photos

#### Endpoint 3: `GET /:id`
- Extract userId from `req.user.id`
- Extract id from params
- Call `getSearchPhotoById()`
- Return photo

#### Endpoint 4: `DELETE /:id`
- Extract userId from `req.user.id`
- Extract id from params
- Call `deleteSearchPhoto()`
- Return success message

#### Endpoint 5: `PUT /:id`
- Validate file exists and is an image
- Extract userId from `req.user.id`
- Extract id from params
- Call `replaceSearchPhoto()`
- Return new photo

**Notes**:
- All endpoints need authentication (add `@UseGuards()` if needed)
- The `req.user.id` assumes you have auth middleware/guards
- File validation: check `file.mimetype.startsWith('image/')`

---

### 🔨 File 3: search.service.ts

#### Method 1: `addSearchFace(vector, searchPhotoId, userId)`
**Purpose**: Save search face to Weaviate

**Steps**:
1. Use `this.client.data.creator()`
2. Set className: 'Face'
3. Set properties:
   ```javascript
   {
     photoId: searchPhotoId,
     eventId: '', // empty for search photos
     sourceType: 'search',
     userId: userId
   }
   ```
4. Set vector with `.withVector(vector)`
5. Execute with `.do()`
6. Return `result.id`

**Key Concept**: This is similar to `addFace()` but includes sourceType and userId

#### Method 2: `searchFacesFromReference(vector, limit)`
**Purpose**: Search event photos using a search reference

**Steps**:
1. Use `this.client.graphql.get()`
2. Set className: 'Face'
3. Select fields: `'photoId eventId sourceType userId _additional { distance }'`
4. Add `.withNearVector({ vector })`
5. Add `.withWhere()` filter:
   ```javascript
   {
     path: ['sourceType'],
     operator: 'Equal',
     valueString: 'event'
   }
   ```
6. Set limit (default 50)
7. Execute with `.do()`

**Key Concept**: The where filter ensures you only search event photos, not other search photos

#### Method 3: `searchWithMultipleReferences(vectors, limit)`
**Purpose**: Search with multiple face vectors and aggregate results

**Steps**:
1. For each vector, call `searchFacesFromReference()`
2. Aggregate all results
3. Deduplicate by photoId (keep best distance)
4. Sort by distance
5. Limit results
6. Return aggregated list

**Optimization**: Use `Promise.all()` to search in parallel

**Example deduplication**:
```javascript
const resultsMap = new Map();
for (const face of allFaces) {
  const existing = resultsMap.get(face.photoId);
  if (!existing || face._additional.distance < existing._additional.distance) {
    resultsMap.set(face.photoId, face);
  }
}
```

---

## Testing Your Implementation

### 1. Upload a Search Photo
```bash
curl -X POST http://localhost:3000/search-reference-photos/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/photo.jpg"
```

### 2. List User's Search Photos
```bash
curl -X GET http://localhost:3000/search-reference-photos \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Delete a Search Photo
```bash
curl -X DELETE http://localhost:3000/search-reference-photos/PHOTO_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Search Using Reference Photos
You'll need to update the existing search controller to use the new search methods.

---

## Common Patterns to Reference

Look at these existing files for patterns:

1. **File Upload & Processing**: [photos.service.ts](api/src/photos/photos.service.ts)
   - Lines 34-100 show how to upload to MinIO and extract faces

2. **Weaviate Operations**: [search.service.ts](api/src/search/search.service.ts)
   - Lines 46-60 show how to add faces to Weaviate
   - Lines 62-71 show how to search Weaviate

3. **Controller with File Upload**: [search.controller.ts](api/src/search/search.controller.ts)
   - Lines 18-45 show file upload with validation

4. **Prisma Queries**: [saved-photos/](api/src/saved-photos/) module
   - Similar CRUD pattern for user-specific resources

---

## Key Differences from Event Photos

| Aspect | Event Photos | Search Reference Photos |
|--------|--------------|-------------------------|
| **Tied to** | Event | User |
| **Persists** | Until event deleted | Until user deletes |
| **Quantity** | Unlimited per event | Max 3 per user |
| **Purpose** | Photos to find | Photos to search with |
| **Weaviate sourceType** | 'event' | 'search' |
| **eventId** | Required | Not applicable (empty) |

---

## Tips for Implementation

1. **Start Simple**: Implement one method at a time, test it, then move to the next
2. **Copy Patterns**: Your codebase already has great patterns - copy and adapt them
3. **Error Handling**: Wrap critical operations in try-catch blocks
4. **Logging**: Use `this.logger.log()` to track what's happening
5. **Metrics**: Consider adding metrics for search photo operations
6. **Testing**: Test the "3 photo limit" and "ownership verification" carefully

---

## Questions to Consider

1. **Authentication**: Do you have auth guards set up? If not, you'll need to add them
2. **File Size Limits**: Should search photos have a size limit?
3. **Thumbnails**: Do you want to generate thumbnails for search photos?
4. **UI Integration**: How will the frontend display and manage these photos?

Good luck with the implementation! 🚀
