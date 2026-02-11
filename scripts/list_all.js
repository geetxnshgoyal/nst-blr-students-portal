const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

async function findStudents() {
    const students = await db.collection('students').get();
    let all = [];
    students.forEach(doc => {
        const d = doc.data();
        all.push({ usn: d.usn, name: d.name });
    });
    console.log(JSON.stringify(all, null, 2));
    process.exit(0);
}

findStudents();
