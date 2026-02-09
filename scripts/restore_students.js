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

const studentsToRestore = [
    {
        name: 'Deepak Kumar Choudhary',
        usn: '2102508736',
        email: 'N/A', // I don't have the email from memory, setting as N/A or try to infer
        linkedin: 'https://www.linkedin.com/in/deepak-kumar-choudhary-b799b0379/',
        github: 'https://github.com/deepakkumarchoudhary042-a11y',
        status: 'left'
    },
    {
        name: 'Shivam Kumar',
        usn: '2102508807',
        email: 'N/A',
        linkedin: 'unavailable',
        status: 'left'
    },
    {
        name: 'Pulkit Namdev',
        usn: '2102508784',
        email: 'N/A',
        linkedin: 'unavailable',
        status: 'left'
    },
    {
        name: 'Mohammed Anas',
        usn: '2102508768',
        email: 'N/A',
        linkedin: 'unavailable',
        github: 'https://github.com/2102508768-anas',
        status: 'left'
    }
];

async function restoreStudents() {
    console.log('♻️  Restoring students and marking as "left"...\n');

    for (const student of studentsToRestore) {
        console.log(`Restoring: ${student.name} (${student.usn})`);

        await db.collection('students').doc(student.usn).set({
            ...student,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`   ✅ Restored successfully`);
    }

    console.log(`\n🎉 Restored ${studentsToRestore.length} students.`);
    process.exit(0);
}

restoreStudents();
