import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SearchService } from './search.service';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';

@Controller('search')
export class SearchController {
    constructor(
        private readonly searchService: SearchService,
        private readonly aiService: AiService,
        private readonly prismaService: PrismaService,
        private readonly metricsService: MetricsService,
    ) { }

    @Post('face')
    @UseInterceptors(FileInterceptor('file'))
    async searchByFace(@UploadedFile() file: Express.Multer.File) {
        try {
            if (!file) {
                throw new BadRequestException('File is required');
            }

            // 1. Get embeddings from AI Service
            const start = Date.now();
            const embeddings = await this.aiService.extractFaces(file.buffer);
            const duration = (Date.now() - start) / 1000;
            this.metricsService.aiProcessingDuration.observe({ operation: 'extract_faces_search' }, duration);

            if (!embeddings || embeddings.length === 0) {
                this.metricsService.faceSearchTotal.inc({ status: 'no_face_detected' });
                return { message: 'No face detected', results: [] };
            }

            // 2. Search Weaviate with multiple face vectors
            const vectors = embeddings.map(e => e.embedding);

            const weaviateResults = await this.searchService.searchWithMultipleReferences(vectors);

            // 3. Extract face data from Weaviate response
            const faces = weaviateResults?.data?.Get?.Face || [];

            if (faces.length === 0) {
                this.metricsService.faceSearchTotal.inc({ status: 'no_matches' });
                return { message: 'No matches found', results: [] };
            }

            // 4. Get photo and event details from database
            const photoIds = faces.map((face: any) => face.photoId).filter(Boolean);

            const photosData = await this.prismaService.photo.findMany({
                where: { id: { in: photoIds } },
                include: { event: true },
            });

            const photosMap = new Map(photosData.map(p => [p.id, p]));

            const results = faces
                .map((face: any) => {
                    const photo = photosMap.get(face.photoId);
                    if (!photo) return null;

                    const confidence = 1 - (face._additional?.distance || 0);
                    this.metricsService.aiConfidenceScore.observe({ operation: 'match' }, confidence);

                    return {
                        id: photo.id,
                        url: photo.storageUrl,
                        eventName: photo.event.name,
                        eventDate: photo.event.date,
                        confidence: confidence,
                    };
                })
                .filter(r => r !== null);

            const uniqueResults = Array.from(
                new Map(results.map(r => [r.id, r])).values()
            );

            this.metricsService.faceSearchTotal.inc({ status: 'success' });

            return {
                message: `Found ${uniqueResults.length} matches`,
                results: uniqueResults,
            };
        } catch (error) {
            console.error('Search error:', error);
            this.metricsService.faceSearchTotal.inc({ status: 'error' });
            throw error;
        }
    }
}
