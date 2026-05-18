require('dotenv').config();
const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
    console.error('❌ Missing FIREBASE_* env vars in .env');
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n')
        })
    });
}

const db = admin.firestore();

async function run() {
    try {
        console.log('⚡ Fetching students from Firestore collection...');
        const snapshot = await db.collection('students').limit(5).get();
        if (snapshot.empty) {
            console.log('⚠️ No student documents found in Firestore!');
            return;
        }

        console.log(`\n✅ Found ${snapshot.size} documents (showing up to 5 limit, without large photo content):`);
        snapshot.forEach(doc => {
            console.log(`\nDocument ID: ${doc.id}`);
            const data = doc.data() || {};
            const cleanData = { ...data };
            if (cleanData.photo) {
                cleanData.photo = cleanData.photo.slice(0, 50) + '... (truncated base64)';
            }
            console.log('Data:', JSON.stringify(cleanData, null, 2));
        });
    } catch (error) {
        console.error('❌ Error fetching students:', error);
    }
}

run();
