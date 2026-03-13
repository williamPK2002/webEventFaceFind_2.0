import { Injectable, OnModuleInit } from '@nestjs/common';
import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';

@Injectable()
export class SearchService implements OnModuleInit {
    private client: WeaviateClient;

    async onModuleInit() {
        this.client = weaviate.client({
            scheme: process.env.WEAVIATE_SCHEME || 'http',
            host: process.env.WEAVIATE_HOST || 'localhost:8080',
        });

        // Ensure schema exists
        await this.ensureSchema();
    }

    async ensureSchema() {
        const schemaConfig = {
            class: 'Face',
            vectorizer: 'none', // We provide vectors manually
            properties: [
                {
                    name: 'photoId',
                    dataType: ['string'],
                },
                {
                    name: 'eventId',
                    dataType: ['string'],
                },
                {
                    name: 'sourceType',
                    dataType: ['string'],
                },
                {
                    name: 'userId',
                    dataType: ['string'],
                },
            ],
        };

        try {
            const schema = await this.client.schema.getter().do();
            const classExists = schema.classes?.some((c) => c.class === 'Face');

            if (!classExists) {
                await this.client.schema.classCreator().withClass(schemaConfig).do();
                console.log('Weaviate "Face" class created.');
            }
        } catch (error) {
            console.error('Error checking/creating Weaviate schema:', error);
        }
    }

    async addFace(vector: number[], photoId: string, eventId: string): Promise<string> {
        const result = await this.client.data
            .creator()
            .withClassName('Face')
            .withProperties({
                photoId,
                eventId,
                sourceType: 'event',
            })
            .withVector(vector)
            .do();

        if (!result.id) {
            throw new Error('Failed to create face in Weaviate');
        }

        return result.id;
    }

    async searchFaces(vector: number[], limit = 10) {
        return await this.client.graphql
            .get()
            .withClassName('Face')
            .withFields('photoId eventId _additional { distance }')
            .withNearVector({ vector })
            .withLimit(limit)
            .do();
    }

    async deleteFace(weaviateId: string) {
        await this.client.data
            .deleter()
            .withClassName('Face')
            .withId(weaviateId)
            .do();
    }

    /**
     * Add a search reference face to Weaviate
     */
    async addSearchFace(vector: number[], searchPhotoId: string, userId: string): Promise<string> {
        const result = await this.client.data
            .creator()
            .withClassName('Face')
            .withProperties({
                photoId: searchPhotoId,
                eventId: '',
                sourceType: 'search',
                userId,
            })
            .withVector(vector)
            .do();

        if (!result.id) {
            throw new Error('Failed to create search face in Weaviate');
        }

        return result.id;
    }

    /**
     * Search for faces using a search reference photo (only searches event photos)
     */
    async searchFacesFromReference(vector: number[], limit = 50) {
        return await this.client.graphql
            .get()
            .withClassName('Face')
            .withFields('photoId eventId sourceType _additional { distance }')
            .withNearVector({ vector })
            .withWhere({
                path: ['sourceType'],
                operator: 'Equal',
                valueString: 'event',
            })
            .withLimit(limit)
            .do();
    }

    /**
     * Search using multiple search reference photos with deduplication
     */
    async searchWithMultipleReferences(vectors: number[][], limit = 50) {
        // Search in parallel for all vectors
        const searchPromises = vectors.map((vector) =>
            this.searchFacesFromReference(vector, limit),
        );
        const searchResults = await Promise.all(searchPromises);

        // Aggregate all results
        const allFaces = searchResults.flatMap(
            (result) => result?.data?.Get?.Face || [],
        );

        // Deduplicate by photoId, keeping the best match (lowest distance)
        const deduplicatedMap = new Map();
        for (const face of allFaces) {
            const existing = deduplicatedMap.get(face.photoId);
            if (
                !existing ||
                face._additional.distance < existing._additional.distance
            ) {
                deduplicatedMap.set(face.photoId, face);
            }
        }

        // Convert back to array, sort by distance, and limit
        const deduplicatedFaces = Array.from(deduplicatedMap.values())
            .sort(
                (a, b) =>
                    a._additional.distance - b._additional.distance,
            )
            .slice(0, limit);

        return {
            data: {
                Get: {
                    Face: deduplicatedFaces,
                },
            },
        };
    }
}
