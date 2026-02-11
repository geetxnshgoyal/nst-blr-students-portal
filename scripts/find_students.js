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
    console.log("Searching for Prateek and Izaz...");
    const students = await db.collection('students').get();
    let found = [];
    students.forEach(doc => {
        const d = doc.data();
        if (d.name && (d.name.toLowerCase().includes('prateek') || d.name.toLowerCase().includes('izaz'))) {
            found.push({ usn: d.usn, name: d.name, email: d.email, photo: d.photo });
        }
    });
    console.log(JSON.stringify(found, null, 2));
    process.exit(0);
}

findStudents();
