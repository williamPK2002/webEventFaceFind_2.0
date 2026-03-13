import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { AiService } from '../ai/ai.service';
import { SearchService } from '../search/search.service';
import { MetricsService } from '../metrics/metrics.service';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';

@Injectable()
export class SearchReferencePhotosService {
    private readonly logger = new Logger(SearchReferencePhotosService.name);
    private readonly MAX_SEARCH_PHOTOS = 3; // Limit per user

    constructor(
        private prisma: PrismaService,
        private minioService: MinioService,
        private aiService: AiService,
        private searchService: SearchService,
        private metricsService: MetricsService,
    ) { }

    private async ensureUserExists(userId: string) {
        const existing = await this.prisma.user.findUnique({ where: { id: userId } });
        if (existing) {
            return existing;
        }

        return await this.prisma.user.create({
            data: {
                id: userId,
                email: `${userId}@temp.local`,
                name: userId,
                role: 'STUDENT',
            },
        });
    }

    /**
     * Upload and process a search reference photo for a user
     */
    async uploadSearchPhoto(file: Express.Multer.File, userId: string) {
        await this.ensureUserExists(userId);
        const existingCount = await this.prisma.searchReferencePhoto.count({ where: { userId } })
        if (existingCount >= this.MAX_SEARCH_PHOTOS) {
            throw new BadRequestException(`Maximum ${this.MAX_SEARCH_PHOTOS} search photos allowed`);
        }
        const storageUrl = await this.minioService.uploadFile(file.originalname, file.buffer, file.mimetype);
        
        let width: number | null = null;
        let height: number | null = null;

        try {
            const metadata = await sharp(file.buffer).metadata();
            width = metadata.width || null;
            height = metadata.height || null;
        } catch (error) {
            this.logger.warn('Failed to extract image metadata', error);
        }

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
            const start = Date.now();
            const faces = await this.aiService.extractFaces(file.buffer);
            const duration = (Date.now() - start) / 1000;
            this.metricsService.aiProcessingDuration.observe({ operation: 'extract_faces' }, duration);
            if (faces.length === 0) {
                await this.deleteSearchPhoto(searchPhoto.id, userId);
                throw new BadRequestException('No faces detected in the uploaded photo');
            }

            const faceRecords = await Promise.all(faces.map(async (face) => {
                const weaviateId = await this.searchService.addSearchFace(face.embedding, searchPhoto.id, userId);
                return {
                    searchPhotoId: searchPhoto.id,
                    weaviateId,
                    x: face.bbox?.[0] || null,
                    y: face.bbox?.[1] || null,
                    w: face.bbox?.[2] || null,
                    h: face.bbox?.[3] || null,
                    confidence: face.det_score || null,
                };
            }));

            await this.prisma.searchFace.createMany({ data: faceRecords });
            return await this.prisma.searchReferencePhoto.findUnique({
                where: { id: searchPhoto.id },
                include: { searchFaces: true },
            });
        } catch (error) {
            this.logger.error('Failed to process search reference photo', error);
            await this.deleteSearchPhoto(searchPhoto.id, userId);
            throw new BadRequestException('Failed to process the uploaded photo');
        }
    }

    /**
     * Get all search reference photos for a user
     */
    async getUserSearchPhotos(userId: string) {
        return await this.prisma.searchReferencePhoto.findMany({
            where: { userId },
            include: { searchFaces: true },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Delete a specific search reference photo
     */
    async deleteSearchPhoto(id: string, userId: string) {
        const photo = await this.prisma.searchReferencePhoto.findUnique({
            where: { id },
        });

        if (!photo || photo.userId !== userId) {
            throw new NotFoundException('Search reference photo not found or unauthorized');
        }

        const faces = await this.prisma.searchFace.findMany({
            where: { searchPhotoId: id },
        });

        for (const face of faces) {
            if (face.weaviateId) {
                try {
                    await this.searchService.deleteFace(face.weaviateId);
                } catch (error) {
                    this.logger.warn(`Failed to delete face ${face.weaviateId} from Weaviate:`, error);
                }
            }
        }

        try {
            await this.minioService.deleteFile(photo.storageUrl);
        } catch (error) {
            this.logger.warn(`Failed to delete file from MinIO:`, error);
        }

        await this.prisma.searchReferencePhoto.delete({
            where: { id },
        });

        return { message: 'Search reference photo deleted successfully' };
    }

    /**
     * Replace an existing search photo with a new one
     */
    async replaceSearchPhoto(id: string, file: Express.Multer.File, userId: string) {
        const photo = await this.prisma.searchReferencePhoto.findUnique({
            where: { id },
        });
        if (!photo || photo.userId !== userId) {
            throw new NotFoundException('Search reference photo not found or unauthorized');
        }
        await this.deleteSearchPhoto(id, userId);
        return await this.uploadSearchPhoto(file, userId);
    }

    /**
     * Get a single search photo by ID
     */
    async getSearchPhotoById(id: string, userId: string) {
        const photo = await this.prisma.searchReferencePhoto.findUnique({
            where: { id },
            include: { searchFaces: true },
        });
        if (!photo || photo.userId !== userId) {
            throw new NotFoundException('Search reference photo not found or unauthorized');
        }
        return photo;
    }
}
