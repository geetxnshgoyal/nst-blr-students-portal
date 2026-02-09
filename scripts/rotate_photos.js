require('dotenv').config();
const admin = require('firebase-admin');
const sharp = require('sharp');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
});

const db = admin.firestore();

async function rotatePhotos() {
    console.log('🔄 Auto-rotating student photos...\n');

    const snapshot = await db.collection('students').get();

    let processedCount = 0;
    let updatedCount = 0;

    for (const doc of snapshot.docs) {
        const student = doc.data();

        // Skip if no photo
        if (!student.photo || student.photo.length < 100) {
            continue;
        }

        try {
            console.log(`Processing: ${student.name}`);

            // Extract base64 data
            const base64Data = student.photo.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            // Auto-rotate based on EXIF orientation and re-compress
            const rotatedBuffer = await sharp(imageBuffer)
                .rotate() // Auto-rotates based on EXIF orientation
                .resize(800, 800, { fit: 'cover', withoutEnlargement: true })
                .webp({ quality: 95 })
                .toBuffer();

            const newBase64Photo = `data:image/webp;base64,${rotatedBuffer.toString('base64')}`;

            // Only update if the image changed (comparing sizes as a rough check)
            if (Math.abs(newBase64Photo.length - student.photo.length) > 100) {
                await db.collection('students').doc(doc.id).update({
                    photo: newBase64Photo,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`   ✅ Rotated and updated`);
                updatedCount++;
            } else {
                console.log(`   ℹ️  Already correct orientation`);
            }

            processedCount++;

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}`);
        }
    }

    console.log(`\n🎉 Summary:`);
    console.log(`- Processed: ${processedCount}`);
    console.log(`- Updated: ${updatedCount}`);

    process.exit(0);
}

rotatePhotos();
