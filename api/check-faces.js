/**
 * Script to check what faces exist in Weaviate
 */

const weaviate = require('weaviate-ts-client').default;

async function checkFaces() {
    const client = weaviate.client({
        scheme: process.env.WEAVIATE_SCHEME || 'http',
        host: process.env.WEAVIATE_HOST || 'localhost:8080',
    });

    try {
        console.log('Fetching all Face objects from Weaviate...\n');
        
        const result = await client.graphql
            .get()
            .withClassName('Face')
            .withFields('photoId eventId sourceType _additional { id }')
            .withLimit(100)
            .do();

        const faces = result?.data?.Get?.Face || [];
        console.log(`Total faces found: ${faces.length}\n`);

        // Group by sourceType
        const bySourceType = {};
        faces.forEach(face => {
            const type = face.sourceType || 'UNDEFINED';
            bySourceType[type] = (bySourceType[type] || 0) + 1;
        });

        console.log('Breakdown by sourceType:');
        Object.entries(bySourceType).forEach(([type, count]) => {
            console.log(`  ${type}: ${count}`);
        });

        // Show sample faces
        console.log('\nSample faces:');
        faces.slice(0, 5).forEach((face, idx) => {
            console.log(`\n  Face ${idx + 1}:`);
            console.log(`    ID: ${face._additional.id}`);
            console.log(`    photoId: ${face.photoId || 'NULL'}`);
            console.log(`    eventId: ${face.eventId || 'NULL'}`);
            console.log(`    sourceType: ${face.sourceType || 'UNDEFINED'}`);
        });

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkFaces();
