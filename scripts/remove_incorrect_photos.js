require('dotenv').config();
const admin = require('firebase-admin');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
});

const db = admin.firestore();

// The 13 students from the first incorrect batch
const incorrectUSNs = [
    '2102508701', // Aarpan Lohora
    '2102508707', // Aditya Ghate
    '2102508749', // AJAY
    '2102508825', // Aksh Wagle
    '2102508714', // Anushka Gupta
    '2102508717', // ARUNIKA CHANDA
    '2102508720', // Ashmita Kamath
    '2102508721', // Asmitha. M
    '2102508722', // Atul Sahu
    '2102508724', // Ayush
    '2102508729', // Bikash Jha
    '2102508732', // Chavi Makana
    '2102508791'  // Chinmaya S
];

async function removeIncorrectPhotos() {
    console.log('🔄 Removing incorrectly assigned photos...\n');

    const batch = db.batch();
    let count = 0;

    for (const usn of incorrectUSNs) {
        const docRef = db.collection('students').doc(usn);
        const doc = await docRef.get();

        if (doc.exists) {
            const student = doc.data();
            console.log(`Removing photo from: ${student.name} (${usn})`);
            batch.update(docRef, { photo: '' });
            count++;
        }
    }

    await batch.commit();
    console.log(`\n✅ Removed ${count} incorrect photos`);
    process.exit(0);
}

removeIncorrectPhotos();
