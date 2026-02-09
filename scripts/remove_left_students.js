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

// Names to remove (fuzzy matched)
const studentsToRemove = [
    'Deepak',
    'Shivam',
    'Pulkit',
    'Anas'
];

async function removeStudents() {
    console.log('🗑️  Removing students no longer in batch...\n');

    const snapshot = await db.collection('students').get();
    let removedCount = 0;

    for (const nameQuery of studentsToRemove) {
        // Find matching students
        const matches = snapshot.docs.filter(doc => {
            const data = doc.data();
            return data.name.toLowerCase().includes(nameQuery.toLowerCase());
        });

        if (matches.length === 0) {
            console.log(`❌ No student found matching "${nameQuery}"`);
            continue;
        }

        // If multiple matches, ask user to confirm (but here we'll just log and proceed cautiously)
        // For common names like 'Shivam', we might match multiple people.
        // Let's be specific about who we are deleting.

        for (const doc of matches) {
            const student = doc.data();

            // Safety checks based on the specific names we know needed removal
            // Deepak Kumar Choudhary
            // Shivam Kumar
            // Pulkit Namdev
            // Mohammed Anas

            let shouldDelete = false;

            if (nameQuery === 'Deepak' && student.name.includes('Deepak Kumar')) shouldDelete = true;
            if (nameQuery === 'Shivam' && student.name.includes('Shivam Kumar')) shouldDelete = true;
            if (nameQuery === 'Pulkit' && student.name.includes('Pulkit')) shouldDelete = true;
            if (nameQuery === 'Anas' && student.name.includes('Mohammed Anas')) shouldDelete = true;

            if (shouldDelete) {
                console.log(`Deleting: ${student.name} (${student.usn})`);
                await db.collection('students').doc(doc.id).delete();
                console.log(`   ✅ Removed successfully\n`);
                removedCount++;
            } else {
                console.log(`⚠️  Skipping partial match: ${student.name} (not the target ${nameQuery})`);
            }
        }
    }

    console.log(`\n🎉 Total Removed: ${removedCount}`);
    process.exit(0);
}

removeStudents();
