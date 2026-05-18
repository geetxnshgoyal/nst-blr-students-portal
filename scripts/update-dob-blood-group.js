#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
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

function normalizeBloodGroup(bg) {
    if (!bg) return '';
    let val = bg.trim().toUpperCase();
    
    // Clean up spaces
    val = val.replace(/\s+/g, '');
    
    // Clean up "VE" or "V" suffixes, e.g. "+VE", "-VE", "B+VE"
    val = val.replace(/VE/g, '').replace(/V/g, '');
    
    // Handle cases where sign is at the beginning, like "+B", "+AB", "-O"
    if (val.startsWith('+')) {
        val = val.slice(1) + '+';
    } else if (val.startsWith('-')) {
        val = val.slice(1) + '-';
    }
    
    // Validate it's in a standard format (like A+, B-, O+, AB+)
    return val;
}

function normalizeDob(dobStr) {
    if (!dobStr) return '';
    let val = dobStr.trim();
    // Convert DD/MM/YYYY to DD-MM-YYYY
    val = val.replace(/\//g, '-');
    return val;
}

async function updateStudent(student) {
    const rawUsn = student.usn || '';
    const usn = rawUsn.trim();
    const name = student.name || '';
    const dob = student.dob || '';
    const bg = student.bloodGroup || '';

    if (!usn) {
        console.log(`⚠️ Skipped row with empty USN (Name: ${name})`);
        return { success: false, skipped: true, error: 'Empty USN' };
    }

    const normalizedDob = normalizeDob(dob);
    const normalizedBg = normalizeBloodGroup(bg);

    try {
        let docRef = db.collection('students').doc(usn);
        let docSnap = await docRef.get();

        // If direct USN doc ID doesn't exist, try querying by 'usn' field
        if (!docSnap.exists) {
            const querySnap = await db.collection('students').where('usn', '==', usn).get();
            if (!querySnap.empty) {
                docRef = querySnap.docs[0].ref;
                docSnap = querySnap.docs[0];
            }
        }

        if (docSnap.exists) {
            await docRef.update({
                birthday: normalizedDob,
                blood_group: normalizedBg,
                bloodGroup: normalizedBg,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Updated: USN = ${usn} | Name = ${name} | DOB = ${normalizedDob} | Blood = ${normalizedBg}`);
            return { success: true, usn, name };
        } else {
            console.log(`❌ Not Found in Firestore: USN = ${usn} | Name = ${name}`);
            return { success: false, error: 'Student not in Firestore', usn, name };
        }
    } catch (err) {
        console.error(`❌ Error updating USN ${usn} (${name}): ${err.message}`);
        return { success: false, error: err.message, usn, name };
    }
}

async function run() {
    const csvFilePath = path.join(__dirname, '..', 'Bday data - Sheet1.csv');
    console.log(`⚡ Reading student list from CSV: ${csvFilePath}`);

    const rows = [];
    fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
            // Find keys dynamically to handle potential column name spacing/deviations
            const keys = Object.keys(row);
            const usnKey = keys.find(k => k.trim().toUpperCase() === 'USN') || 'USN';
            const dobKey = keys.find(k => k.trim().toLowerCase().includes('birth') || k.trim().toLowerCase().includes('dob')) || 'Date of Birth';
            const bloodKey = keys.find(k => k.trim().toLowerCase().includes('blood')) || 'Blood group(Use only Capital letters and symbols like +, -)';
            const nameKey = keys.find(k => k.trim().toLowerCase().includes('name')) || 'NAME (as per your 10th marks card)';

            rows.push({
                usn: row[usnKey],
                name: row[nameKey],
                dob: row[dobKey],
                bloodGroup: row[bloodKey]
            });
        })
        .on('end', async () => {
            console.log(`📋 CSV parsed. Found ${rows.length} rows to update.`);
            
            let successCount = 0;
            let failureCount = 0;
            let skippedCount = 0;
            const failures = [];

            for (const row of rows) {
                const res = await updateStudent(row);
                if (res.success) {
                    successCount++;
                } else if (res.skipped) {
                    skippedCount++;
                } else {
                    failureCount++;
                    failures.push(`${res.usn || 'Unknown USN'} (${res.name || 'Unknown Name'}): ${res.error}`);
                }
            }

            console.log('\n📊 --- Migration Summary ---');
            console.log(`✅ Successfully Updated: ${successCount}`);
            console.log(`⚠️ Skipped (Empty USN): ${skippedCount}`);
            console.log(`❌ Failed / Not Found in DB: ${failureCount}`);
            
            if (failures.length > 0) {
                console.log('\nDetails of non-updates / failures:');
                failures.forEach(f => console.log(` - ${f}`));
            }

            process.exit(0);
        })
        .on('error', (err) => {
            console.error('❌ Error reading CSV file:', err);
            process.exit(1);
        });
}

run();
