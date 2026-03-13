/**
 * Script to update existing faces in Weaviate to have sourceType='event'
 * 
 * Run this with: node fix-existing-faces.js
 */

const weaviate = require('weaviate-ts-client').default;

async function updateExistingFaces() {
    const client = weaviate.client({
        scheme: process.env.WEAVIATE_SCHEME || 'http',
        host: process.env.WEAVIATE_HOST || 'localhost:8080',
    });

    try {
        console.log('Fetching all Face objects from Weaviate...');
        
        // Get all faces that don't have sourceType set
        const result = await client.graphql
            .get()
            .withClassName('Face')
            .withFields('photoId eventId sourceType _additional { id }')
            .withLimit(10000)
            .do();

        const faces = result?.data?.Get?.Face || [];
        console.log(`Found ${faces.length} faces in total`);

        // Filter faces that need updating (no sourceType or sourceType is not 'event' or 'search')
        const facesToUpdate = faces.filter(face => {
            // If it has eventId but no sourceType, or if sourceType is missing
            return face.eventId && !face.sourceType;
        });

        console.log(`Found ${facesToUpdate.length} faces that need sourceType='event'`);

        // Update each face
        let updated = 0;
        let failed = 0;

        for (const face of facesToUpdate) {
            try {
                await client.data
                    .updater()
                    .withClassName('Face')
                    .withId(face._additional.id)
                    .withProperties({
                        photoId: face.photoId,
                        eventId: face.eventId,
                        sourceType: 'event',
                    })
                    .do();
                
                updated++;
                if (updated % 10 === 0) {
                    console.log(`Updated ${updated}/${facesToUpdate.length}...`);
                }
            } catch (error) {
                failed++;
                console.error(`Failed to update face ${face._additional.id}:`, error.message);
            }
        }

        console.log('\n✅ Migration complete!');
        console.log(`   Updated: ${updated}`);
        console.log(`   Failed: ${failed}`);
        console.log(`   Total: ${faces.length}`);

    } catch (error) {
        console.error('Error during migration:', error);
        process.exit(1);
    }
}

updateExistingFaces();
