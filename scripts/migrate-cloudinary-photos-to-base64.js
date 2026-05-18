#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const sharp = require('sharp');
const admin = require('firebase-admin');

const args = process.argv.slice(2);

function getArgValue(name, fallback) {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    return hit.slice(name.length + 3);
}

const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const OPTIMIZE = args.includes('--optimize');
const collectionName = getArgValue('collection', 'students');
const limit = Number(getArgValue('limit', '0')) || 0;
const requestedWidth = Number(getArgValue('width', '0')) || 0;
const width = requestedWidth > 0 ? Math.round(requestedWidth) : 0;
const requestedQuality = Number(getArgValue('quality', '92')) || 92;
const quality = Math.max(1, Math.min(100, Math.round(requestedQuality)));
const onlineStudentsUrl = getArgValue(
    'online-students-url',
    process.env.ONLINE_STUDENTS_URL || 'https://nst-students.vercel.app/NSTStudents.json'
);

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing FIREBASE_* env vars in .env');
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

function isBase64Image(value) {
    return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(String(value || '').trim());
}

function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || '').trim());
}

function getSourcePhotoUrl(data) {
    return String(
        data.photo_url ||
        data.pic_url ||
        data.cloudinary_url ||
        data.image_url ||
        data.original_photo ||
        ''
    ).trim();
}

function normalizeUsn(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeName(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getStudentUsn(data, docId) {
    return normalizeUsn(
        data.usn ||
        data.USN ||
        data.regNo ||
        data.regno ||
        data.registrationNo ||
        data.registrationNumber ||
        docId ||
        ''
    );
}

function getStudentName(data) {
    return normalizeName(data.name || data.studentName || data.fullName || '');
}

async function buildOnlinePhotoLookup(url) {
    const byUsn = new Map();
    const byName = new Map();

    const response = await axios.get(url, {
        timeout: 25000,
        maxRedirects: 5
    });

    const payload = response.data;
    const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.students)
            ? payload.students
            : [];

    for (const row of rows) {
        const picUrl = String(row?.pic_url || row?.photo || row?.photo_url || '').trim();
        if (!isHttpUrl(picUrl)) continue;

        const usn = normalizeUsn(row?.usn || row?.USN || row?.regNo || row?.regno || '');
        if (usn && !byUsn.has(usn)) byUsn.set(usn, picUrl);

        const name = normalizeName(row?.name || row?.studentName || row?.fullName || '');
        if (name && !byName.has(name)) byName.set(name, picUrl);
    }

    return {
        byUsn,
        byName,
        totalRows: rows.length
    };
}

function getOnlinePhotoUrl(lookup, data, docId) {
    const usn = getStudentUsn(data, docId);
    if (usn && lookup.byUsn.has(usn)) {
        return lookup.byUsn.get(usn);
    }

    const name = getStudentName(data);
    if (name && lookup.byName.has(name)) {
        return lookup.byName.get(name);
    }

    return '';
}

function toCloudinaryFetchUrl(url) {
    const source = String(url || '').trim();
    if (!/res\.cloudinary\.com/i.test(source)) return source;
    if (!/\/upload\//i.test(source)) return source;

    // Keep source quality by default; only apply Cloudinary transforms when requested.
    if (!OPTIMIZE) return source;

    const transforms = ['f_auto'];
    if (width > 0) transforms.push(`w_${width}`, 'c_limit');
    transforms.push(`q_${quality}`);

    return source.replace('/upload/', `/upload/${transforms.join(',')}/`);
}

async function fetchImageBuffer(url) {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 25000,
        maxRedirects: 5
    });

    return {
        buffer: Buffer.from(response.data),
        contentType: response.headers['content-type'] || ''
    };
}

async function imageUrlToBase64(url) {
    const transformedUrl = toCloudinaryFetchUrl(url);
    const { buffer, contentType } = await fetchImageBuffer(transformedUrl);

    // Default mode preserves the original image bytes for best visual quality.
    if (!OPTIMIZE) {
        const safeMime = /^image\//i.test(contentType) ? contentType : 'image/jpeg';
        return `data:${safeMime};base64,${buffer.toString('base64')}`;
    }

    let jpegBuffer;
    try {
        let pipeline = sharp(buffer, { failOn: 'none' }).rotate();
        if (width > 0) {
            pipeline = pipeline.resize({ width, withoutEnlargement: true });
        }

        jpegBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    } catch (err) {
        // Fallback if sharp cannot decode source; keep original payload.
        const safeMime = /^image\//i.test(contentType) ? contentType : 'image/jpeg';
        return `data:${safeMime};base64,${buffer.toString('base64')}`;
    }

    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

(async () => {
    const snapshot = await db.collection(collectionName).get();

    let onlineLookup = {
        byUsn: new Map(),
        byName: new Map(),
        totalRows: 0
    };

    try {
        onlineLookup = await buildOnlinePhotoLookup(onlineStudentsUrl);
        console.log(`Loaded ${onlineLookup.totalRows} online student rows from ${onlineStudentsUrl}`);
    } catch (err) {
        console.warn(`Could not load online students feed (${onlineStudentsUrl}): ${err.message}`);
    }

    let scanned = 0;
    let withPhoto = 0;
    let alreadyBase64 = 0;
    let invalidPhoto = 0;
    let candidates = 0;
    let converted = 0;
    let failed = 0;
    let onlineMatched = 0;
    const failedDocs = [];

    for (const doc of snapshot.docs) {
        if (limit > 0 && scanned >= limit) break;
        scanned += 1;

        const data = doc.data() || {};
        const photo = String(data.photo || '').trim();
        const sourcePhotoUrl = getSourcePhotoUrl(data);
        const onlinePhotoUrl = getOnlinePhotoUrl(onlineLookup, data, doc.id);

        if (!photo) continue;
        withPhoto += 1;

        if (isBase64Image(photo) && !FORCE) {
            alreadyBase64 += 1;
            continue;
        }

        const photoToConvert = isHttpUrl(photo)
            ? photo
            : (sourcePhotoUrl || onlinePhotoUrl);

        if (!isHttpUrl(photo) && !isHttpUrl(sourcePhotoUrl) && isHttpUrl(onlinePhotoUrl)) {
            onlineMatched += 1;
        }

        if (!isHttpUrl(photoToConvert)) {
            invalidPhoto += 1;
            continue;
        }

        candidates += 1;

        try {
            const base64Photo = await imageUrlToBase64(photoToConvert);

            if (APPLY) {
                await doc.ref.update({
                    photo: base64Photo,
                    photo_source: 'cloudinary-base64-migration',
                    photo_migrated_at: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            converted += 1;
            if (converted % 10 === 0) {
                console.log(`Processed ${converted}/${candidates} candidates...`);
            }
        } catch (err) {
            failed += 1;
            failedDocs.push({ id: doc.id, error: err.message });
            console.error(`Failed ${doc.id}: ${err.message}`);
        }
    }

    console.log(JSON.stringify({
        mode: APPLY ? 'apply' : 'dry-run',
        collection: collectionName,
        onlineStudentsUrl,
        onlineRows: onlineLookup.totalRows,
        onlineMatched,
        optimize: OPTIMIZE,
        width,
        quality,
        scanned,
        withPhoto,
        alreadyBase64,
        invalidPhoto,
        candidates,
        converted,
        failed,
        failedDocsSample: failedDocs.slice(0, 20)
    }, null, 2));
})();
