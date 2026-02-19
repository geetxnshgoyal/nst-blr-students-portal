require('dotenv').config();
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DATA_FILE = path.join(__dirname, '..', 'data.txt');
const COLLECTION = 'students';

function parseDob(input, blockStyle) {
  const value = String(input || '').trim();
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return value;

  const first = Number(m[1]);
  const second = Number(m[2]);
  const year = Number(m[3]);

  let day;
  let month;

  if (blockStyle === 1) {
    day = first;
    month = second;
  } else {
    month = first;
    day = second;
  }

  if (month > 12 && day <= 12) {
    const temp = day;
    day = month;
    month = temp;
  }

  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function titleCase(name) {
  return String(name || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function emailScore(email) {
  const value = String(email || '').trim();
  if (!value) return 0;
  let score = 1;
  if (/@svyasa-sas\.edu\.in$/i.test(value)) score += 2;
  if (!/@g(na)?mail\.com$/i.test(value)) score += 1;
  return score;
}

function pickBetter(existing, incoming) {
  const existingScore = emailScore(existing.email) + (existing.parentEmail ? 1 : 0);
  const incomingScore = emailScore(incoming.email) + (incoming.parentEmail ? 1 : 0);

  if (incomingScore > existingScore) return incoming;
  if (existingScore > incomingScore) return existing;
  if (incoming.name.length > existing.name.length) return incoming;
  return existing;
}

function parseAndDeduplicateRecords(fileContent) {
  const lines = fileContent.split(/\r?\n/);
  const records = [];
  let blockStyle = 1;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      blockStyle = 2;
      continue;
    }

    const parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 4) continue;

    let name;
    let email;
    let parentEmail;
    let mobile;
    let dob;

    if (parts.length === 4) {
      [name, email, mobile, dob] = parts;
      parentEmail = '';
    } else {
      [name, email, parentEmail, mobile, dob] = parts;
    }

    const cleaned = {
      name: String(name || '').replace(/\s+/g, ' ').trim(),
      email: String(email || '').trim(),
      parentEmail: String(parentEmail || '').trim(),
      mobile: String(mobile || '').replace(/\D/g, ''),
      dob: parseDob(dob, blockStyle),
    };

    if (!/^\d{10}$/.test(cleaned.mobile)) continue;
    records.push(cleaned);
  }

  const byMobile = new Map();
  for (const record of records) {
    if (!byMobile.has(record.mobile)) {
      byMobile.set(record.mobile, record);
    } else {
      byMobile.set(record.mobile, pickBetter(byMobile.get(record.mobile), record));
    }
  }

  const byIdentity = new Map();
  for (const record of byMobile.values()) {
    const identityKey = `${normalizeName(record.name)}|${record.dob}`;
    if (!byIdentity.has(identityKey)) {
      byIdentity.set(identityKey, record);
    } else {
      const selected = pickBetter(byIdentity.get(identityKey), record);
      byIdentity.set(identityKey, selected);
    }
  }

  const uniqueRecords = Array.from(byIdentity.values()).sort((a, b) => a.name.localeCompare(b.name));

  return uniqueRecords.map((record) => {
    const primaryEmail = String(record.email || '').trim();
    const guardianEmail = String(record.parentEmail || '').trim();
    const institutionalEmail = /@svyasa-sas\.edu\.in$/i.test(primaryEmail)
      ? primaryEmail
      : (/^.+@svyasa-sas\.edu\.in$/i.test(guardianEmail) ? guardianEmail : '');

    return {
      name: titleCase(record.name),
      usn: record.mobile,
      email: /@svyasa-sas\.edu\.in$/i.test(primaryEmail) ? '' : primaryEmail,
      institutional_email: institutionalEmail,
      birthday: record.dob,
      gender: '',
      batch: '',
      photo: '',
      github: '',
      linkedin: '',
      status: 'active',
      source: 'data.txt',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
  });
}

function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase credentials in .env (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  return admin.firestore();
}

async function importStudents() {
  const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
  const students = parseAndDeduplicateRecords(fileContent);
  const db = initFirebase();
  const batch = db.batch();

  students.forEach((student, index) => {
    const docId = student.usn;
    const docRef = db.collection(COLLECTION).doc(docId);
    const payload = {
      ...student,
      abc_id: `NST${String(index + 1).padStart(4, '0')}`,
    };

    batch.set(docRef, payload, { merge: true });
  });

  await batch.commit();

  console.log(`Imported ${students.length} unique students to Firestore collection '${COLLECTION}'.`);
}

importStudents()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Firebase import failed:', error.message);
    process.exit(1);
  });
