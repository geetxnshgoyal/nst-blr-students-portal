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
const collectionName = getArgValue('collection', 'students');
const limit = Number(getArgValue('limit', '0')) || 0;
const width = Number(getArgValue('width', '360')) || 360;
const quality = Number(getArgValue('quality', '68')) || 68;

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

function toCloudinaryJpgUrl(url) {
    const source = String(url || '').trim();
    if (!/res\.cloudinary\.com/i.test(source)) return source;
    if (!/\/upload\//i.test(source)) return source;

    // Force a browser-safe format (HEIC -> JPG) and reduce payload before base64 storage.
    return source.replace('/upload/', `/upload/f_jpg,q_${quality},w_${width}/`);
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
    const transformedUrl = toCloudinaryJpgUrl(url);
    const { buffer, contentType } = await fetchImageBuffer(transformedUrl);

    let jpegBuffer;
    try {
        jpegBuffer = await sharp(buffer, { failOn: 'none' })
            .rotate()
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
    } catch (err) {
        // Fallback if sharp cannot decode source; keep original payload.
        const safeMime = /^image\//i.test(contentType) ? contentType : 'image/jpeg';
        return `data:${safeMime};base64,${buffer.toString('base64')}`;
    }

    return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

(async () => {
    const snapshot = await db.collection(collectionName).get();

    let scanned = 0;
    let withPhoto = 0;
    let alreadyBase64 = 0;
    let invalidPhoto = 0;
    let candidates = 0;
    let converted = 0;
    let failed = 0;
    const failedDocs = [];

    for (const doc of snapshot.docs) {
        if (limit > 0 && scanned >= limit) break;
        scanned += 1;

        const data = doc.data() || {};
        const photo = String(data.photo || '').trim();

        if (!photo) continue;
        withPhoto += 1;

        if (isBase64Image(photo) && !FORCE) {
            alreadyBase64 += 1;
            continue;
        }

        if (!isHttpUrl(photo)) {
            invalidPhoto += 1;
            continue;
        }

        candidates += 1;

        try {
            const base64Photo = await imageUrlToBase64(photo);

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
