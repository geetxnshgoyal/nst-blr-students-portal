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

async function analyzeProfiles() {
    console.log('📊 Generating Student Profile Analysis...\n');
    console.log('═'.repeat(60));

    const snapshot = await db.collection('students').get();
    const students = [];

    snapshot.forEach(doc => students.push(doc.data()));

    // Sort students alphabetically
    students.sort((a, b) => a.name.localeCompare(b.name));

    let stats = {
        total: students.length,
        missingPhoto: 0,
        missingDOB: 0,
        missingLinkedIn: 0,
        missingGitHub: 0,
        fullyComplete: 0
    };

    const lists = {
        missingPhoto: [],
        missingDOB: [],
        missingLinkedIn: [],
        missingGitHub: [],
        fullyComplete: []
    };

    students.forEach(s => {
        let isComplete = true;

        // Check Photo
        const hasPhoto = s.photo && s.photo.length > 100;
        if (!hasPhoto) {
            stats.missingPhoto++;
            lists.missingPhoto.push(s.name);
            isComplete = false;
        }

        // Check DOB
        const hasDOB = s.birthday && s.birthday.length > 0;
        if (!hasDOB) {
            stats.missingDOB++;
            lists.missingDOB.push(s.name);
            isComplete = false;
        }

        // Check LinkedIn
        // Consider "Available" if it has linkedin.com and not "unavailable"
        const hasLinkedIn = s.linkedin && s.linkedin.includes('linkedin.com') && !s.linkedin.includes('unavailable');
        if (!hasLinkedIn) {
            stats.missingLinkedIn++;
            lists.missingLinkedIn.push(s.name);
            isComplete = false;
        }

        // Check GitHub
        const hasGitHub = s.github && s.github.includes('github.com');
        if (!hasGitHub) {
            stats.missingGitHub++;
            lists.missingGitHub.push(s.name);
            isComplete = false;
        }

        if (isComplete) {
            stats.fullyComplete++;
            lists.fullyComplete.push(s.name);
        }
    });

    console.log(`👨‍🎓 Total Students: ${stats.total}\n`);

    console.log(`📸 Missing Photos: ${stats.missingPhoto} (${Math.round((stats.missingPhoto / stats.total) * 100)}%)`);
    console.log(`📅 Missing DOB: ${stats.missingDOB} (${Math.round((stats.missingDOB / stats.total) * 100)}%)`);
    console.log(`🔗 Missing LinkedIn: ${stats.missingLinkedIn} (${Math.round((stats.missingLinkedIn / stats.total) * 100)}%)`);
    console.log(`🐙 Missing GitHub: ${stats.missingGitHub} (${Math.round((stats.missingGitHub / stats.total) * 100)}%)`);

    console.log(`\n✅ FULLY COMPLETE PROFILES: ${stats.fullyComplete} (${Math.round((stats.fullyComplete / stats.total) * 100)}%)\n`);

    console.log('═'.repeat(60));

    if (lists.missingPhoto.length > 0) {
        console.log(`\n📸 Students Missing Photos (${lists.missingPhoto.length}):`);
        console.log(lists.missingPhoto.join(', '));
    }

    /*
    // Optional: Print lists for other missing fields if needed, 
    // but usually photo is the most critical visual indicator.
    if (lists.missingDOB.length > 0) {
        console.log(`\n📅 Students Missing DOB (${lists.missingDOB.length}):`);
        // console.log(lists.missingDOB.join(', ')); 
    }
    */

    console.log('\n' + '═'.repeat(60));
    process.exit(0);
}

analyzeProfiles();
