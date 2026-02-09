require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const admin = require('firebase-admin');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    console.log('✅ Email service configured');
} else {
    console.warn('⚠️ SMTP not configured - OTP will be logged to console');
}
function getBase64Logo() {
    try {
        const logoPath = path.join(__dirname, 'public', 'favicon.png');
        if (fs.existsSync(logoPath)) {
            const image = fs.readFileSync(logoPath);
            return `data:image/png;base64,${image.toString('base64')}`;
        }
    } catch (e) {
        console.error('Error loading logo:', e);
    }
    return '';
}

async function sendOTP(email, otp, studentName) {
    const subject = 'NST Student Portal - Verification Code';
    const logoPath = path.join(__dirname, 'public', 'logo.png');

    // Prepare attachment if file exists
    const attachments = [];
    let logoHtml = '';

    if (fs.existsSync(logoPath)) {
        attachments.push({
            filename: 'logo.png',
            path: logoPath,
            cid: 'nstlogo' // same cid value as in the html img src
        });
        logoHtml = `<img src="cid:nstlogo" alt="NST Logo" style="width: 64px; height: 64px; margin-bottom: 16px; border-radius: 12px;">`;
    }

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; background-color: #f9fafb;">
            <div style="background: #ffffff; padding: 30px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="text-align: center; margin-bottom: 24px;">
                    ${logoHtml}
                    <h2 style="color: #6d28d9; margin: 0; font-size: 24px; font-weight: 700;">NST Student Portal</h2>
                    <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 14px;">Secure Verified Access</p>
                </div>
                <div style="background: #f8fafc; padding: 25px; border-radius: 12px; margin: 20px 0;">
                    <p style="color: #374151; margin: 0 0 10px 0; font-size: 16px;">Hello <strong>${studentName}</strong>,</p>
                    <p style="color: #374151; margin: 0; font-size: 16px;">Your verification code to update your profile is:</p>
                </div>
                <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); padding: 25px; text-align: center; border-radius: 12px; margin: 20px 0;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.1);">${otp}</span>
                </div>
                <div style="text-align: center; color: #6b7280; font-size: 14px;">
                    <p style="margin: 0;">This code will expire in <strong>10 minutes</strong>.</p>
                    <p style="margin: 15px 0 0 0; font-size: 12px;">If you didn't request this, please ignore this email.</p>
                </div>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #9ca3af;">
                    <p style="margin: 0;">© ${new Date().getFullYear()} NST Bangalore. All rights reserved.</p>
                </div>
            </div>
        </div>
    `;

    if (transporter) {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || 'NST Student Portal <noreply@nst-portal.com>',
            to: email,
            subject,
            html,
            attachments, // Add attachments here
        });
        console.log(`📧 OTP sent to ${email}`);
    } else {
        console.log(`\n📧 [DEV MODE] OTP for ${email}: ${otp}\n`);
    }
}
let db = null;
let firebaseInitialized = false;

function initializeFirebase() {
    try {
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
            console.error('❌ Firebase credentials not found in environment variables');
            return false;
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
        });

        db = admin.firestore();
        console.log('✅ Firebase Admin SDK initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
        return false;
    }
}

firebaseInitialized = initializeFirebase();
let storedPasswordHash = null;
const DEFAULT_PASSWORD = process.env.PASSWORD || '12345678';

(async () => {
    if (process.env.PASSWORD_HASH) {
        storedPasswordHash = process.env.PASSWORD_HASH;
    } else {
        storedPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
    }
})();
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            connectSrc: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(express.json());


const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many attempts' },
});

const portalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Rate limit exceeded' },
});


const otpRequestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100, // Allow 100 requests per minute per IP (prevents IP blocking)
    message: { error: 'Too many requests from this IP. Please wait a minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Maximum 10 verify attempts per 15 minutes
    message: { error: 'Too many verification attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many upload attempts' },
});
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images allowed'), false);
        }
    }
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

function isValidUSN(usn) {
    return /^[0-9]{10}$/.test(usn);
}

// ===== Block Sensitive Files =====
app.use((req, res, next) => {
    const blocked = ['/students.json', '/abc.txt', '/server.js', '/package.json', '/.env'];
    if (blocked.includes(req.path.toLowerCase()) || req.path.endsWith('.json') || req.path.endsWith('.txt')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

// ===== Static Files =====
app.use(express.static(path.join(__dirname, 'public'), {
    index: 'index.html',
    dotfiles: 'deny'
}));

const ADMIN_EMAIL = 'goyalgeetansh@gmail.com';

// Admin Auth Middleware
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err || user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
        req.user = user;
        next();
    });
}


app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});




app.post('/api/admin/login', authLimiter, async (req, res) => {
    try {
        const otp = crypto.randomInt(100000, 999999).toString();
        const adminEmail = process.env.ADMIN_EMAIL || 'goyalgeetansh@gmail.com';

        // Store OTP for Admin in Firestore
        await db.collection('otps').doc('ADMIN').set({
            otp,
            email: adminEmail,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000), // 5 mins
            verified: false
        });

        await sendOTP(adminEmail, otp, 'Administrator');

        // Return masked email
        const masked = adminEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        res.json({ success: true, message: `OTP sent to ${masked}` });
    } catch (e) {
        console.error('Admin login error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// 2. Verify Admin OTP
app.post('/api/admin/verify', authLimiter, async (req, res) => {
    try {
        const { otp } = req.body;

        const docRef = db.collection('otps').doc('ADMIN');
        const doc = await docRef.get();

        if (!doc.exists) return res.status(400).json({ error: 'No OTP requested' });

        const stored = doc.data();

        if (stored.expiresAt.toMillis() < Date.now()) {
            await docRef.delete();
            return res.status(400).json({ error: 'OTP expired' });
        }

        if (stored.otp !== otp.trim()) return res.status(400).json({ error: 'Invalid OTP' });

        // Success - Issue Admin Token
        await docRef.delete(); // Cleanup
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ success: true, token });
    } catch (e) {
        console.error('Admin verify error:', e);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// 3. Get All Students (Protected)
app.get('/api/admin/students', authenticateAdmin, async (req, res) => {
    try {
        if (!firebaseInitialized || !db) return res.status(503).json({ error: 'Database unavailable' });

        const snapshot = await db.collection('students').get();
        const students = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            students.push({
                usn: doc.id,
                ...data
            });
        });

        res.json({ success: true, students });
    } catch (e) {
        console.error('Admin fetch error:', e);
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

// ===== Student Portal API =====

// Get student by USN
app.get('/api/portal/student/:usn', portalLimiter, async (req, res) => {
    try {
        const { usn } = req.params;

        if (!isValidUSN(usn)) {
            return res.status(400).json({ error: 'Invalid USN format' });
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({ error: 'Database not available' });
        }

        const studentDoc = await db.collection('students').doc(usn).get();

        if (!studentDoc.exists) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = studentDoc.data();

        const safeStudent = {
            name: student.name || '',
            usn: student.usn || usn,
            email: student.email || '',
            institutional_email: student.institutional_email || '',
            gender: student.gender || '',
            batch: student.batch || '',
            birthday: student.birthday || '',
            photo: student.photo || '',
            github: student.github || '',
            linkedin: student.linkedin || '',
            missingFields: []
        };

        if (!safeStudent.photo) safeStudent.missingFields.push('photo');
        if (!safeStudent.github) safeStudent.missingFields.push('github');
        if (!safeStudent.linkedin) safeStudent.missingFields.push('linkedin');
        if (!safeStudent.email) safeStudent.missingFields.push('email');
        if (!safeStudent.birthday) safeStudent.missingFields.push('birthday');

        res.json(safeStudent);
    } catch (error) {
        console.error('Portal lookup error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Request OTP
app.post('/api/portal/student/:usn/request-otp', otpRequestLimiter, async (req, res) => {
    try {
        const { usn } = req.params;

        if (!isValidUSN(usn)) {
            return res.status(400).json({ error: 'Invalid USN format' });
        }

        const otpRef = db.collection('otps');

        // Check for existing OTP and cooldown
        const doc = await otpRef.doc(usn).get();
        if (doc.exists) {
            const data = doc.data();
            const timeSinceCreated = Date.now() - data.createdAt.toMillis();

            // 30s cooldown
            if (timeSinceCreated < 30 * 1000) {
                const waitSeconds = Math.ceil((30 * 1000 - timeSinceCreated) / 1000);
                return res.status(429).json({
                    error: `Please wait ${waitSeconds}s before sending another code`
                });
            }
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({ error: 'Database not available' });
        }

        const studentDoc = await db.collection('students').doc(usn).get();

        if (!studentDoc.exists) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const student = studentDoc.data();
        const email = student.institutional_email;

        if (!email) {
            return res.status(400).json({ error: 'No institutional email on record' });
        }

        const otp = crypto.randomInt(100000, 999999).toString();

        // Store in Firestore (Expires in 10 mins)
        await otpRef.doc(usn).set({
            otp,
            email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
            verified: false
        });

        await sendOTP(email, otp, student.name || 'Student');

        const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        res.json({
            success: true,
            message: `OTP sent to ${maskedEmail}`,
            email: maskedEmail
        });
    } catch (error) {
        console.error('OTP request error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Verify OTP
app.post('/api/portal/student/:usn/verify-otp', portalLimiter, async (req, res) => {
    try {
        const { usn } = req.params;
        const { otp } = req.body;

        if (!isValidUSN(usn)) {
            return res.status(400).json({ error: 'Invalid USN format' });
        }

        if (!otp || typeof otp !== 'string') {
            return res.status(400).json({ error: 'OTP required' });
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({ error: 'Database unavailable' });
        }

        const otpDocRef = db.collection('otps').doc(usn);
        const otpDoc = await otpDocRef.get();

        if (!otpDoc.exists) {
            return res.status(400).json({ error: 'No OTP requested. Please request a new OTP.' });
        }

        const stored = otpDoc.data();

        if (stored.expiresAt.toMillis() < Date.now()) {
            await otpDocRef.delete();
            return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
        }

        if (stored.otp !== otp.trim()) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        // Mark as verified (optional if we just issue token, but good for audit)
        await otpDocRef.update({ verified: true });

        const editToken = jwt.sign({ usn, verified: true }, JWT_SECRET, { expiresIn: '15m' });

        // Fetch full student data to return to the user (unmasked)
        const studentDoc = await db.collection('students').doc(usn).get();
        const student = studentDoc.data();

        res.json({
            success: true,
            message: 'Verification successful!',
            editToken,
            student: student // Return full data so UI can populate forms
        });

        // Cleanup OTP after successful verification to prevent reuse
        await otpDocRef.delete();

    } catch (error) {
        console.error('OTP verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// ===== Audit Logging Helper =====
async function logAudit(usn, action, changes, req) {
    try {
        if (!firebaseInitialized || !db) return;

        const logEntry = {
            usn,
            action,
            changes,
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'] || 'Unknown',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('audit_logs').add(logEntry);
        console.log(`📝 Audit log created for ${usn}: ${action}`);
    } catch (error) {
        console.error('Audit logging failed:', error);
    }
}

// Update student profile (requires OTP verification)
app.patch('/api/portal/student/:usn', portalLimiter, async (req, res) => {
    try {
        const { usn } = req.params;
        const { editToken, ...updates } = req.body;

        if (!isValidUSN(usn)) {
            return res.status(400).json({ error: 'Invalid USN format' });
        }

        if (!editToken) {
            return res.status(401).json({ error: 'Verification required. Please verify your identity first.' });
        }

        try {
            const decoded = jwt.verify(editToken, JWT_SECRET);
            if (decoded.usn !== usn) {
                return res.status(403).json({ error: 'Token mismatch. Please re-verify.' });
            }
        } catch (err) {
            return res.status(403).json({ error: 'Session expired. Please verify again.' });
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({ error: 'Database not available' });
        }

        const allowedFields = ['github', 'linkedin', 'email', 'birthday'];
        const sanitizedUpdates = {};

        // Track what actually changed for the log
        const changes = {};

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                let value = String(updates[field]).trim();

                if (field === 'github' && value && !value.includes('github.com')) {
                    return res.status(400).json({ error: 'Invalid GitHub URL' });
                }
                if (field === 'linkedin' && value && !value.includes('linkedin.com')) {
                    return res.status(400).json({ error: 'Invalid LinkedIn URL' });
                }
                if (field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    return res.status(400).json({ error: 'Invalid email format' });
                }
                if (field === 'birthday' && value && !/^\d{2}-\d{2}-\d{4}$/.test(value)) {
                    return res.status(400).json({ error: 'Invalid birthday format. Use DD-MM-YYYY' });
                }

                sanitizedUpdates[field] = value;
                changes[field] = value;
            }
        }

        if (Object.keys(sanitizedUpdates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        const studentRef = db.collection('students').doc(usn);
        const studentDoc = await studentRef.get();

        if (!studentDoc.exists) {
            return res.status(404).json({ error: 'Student not found' });
        }

        sanitizedUpdates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await studentRef.update(sanitizedUpdates);

        // LOG THE ACTION
        await logAudit(usn, 'UPDATE_PROFILE', changes, req);

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Portal update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Upload photo (requires OTP verification)
app.post('/api/portal/student/:usn/photo', uploadLimiter, upload.single('photo'), async (req, res) => {
    try {
        const { usn } = req.params;
        const editToken = req.body.editToken || req.query.editToken;

        if (!isValidUSN(usn)) {
            return res.status(400).json({ error: 'Invalid USN format' });
        }

        if (!editToken) {
            return res.status(401).json({ error: 'Verification required.' });
        }

        try {
            const decoded = jwt.verify(editToken, JWT_SECRET);
            if (decoded.usn !== usn) {
                return res.status(403).json({ error: 'Token mismatch.' });
            }
        } catch (err) {
            return res.status(403).json({ error: 'Session expired.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No photo provided' });
        }

        if (!firebaseInitialized || !db) {
            return res.status(503).json({ error: 'Database not available' });
        }

        const studentRef = db.collection('students').doc(usn);
        const studentDoc = await studentRef.get();

        if (!studentDoc.exists) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const compressedBuffer = await sharp(req.file.buffer)
            .resize(400, 400, { fit: 'cover', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();

        const base64Photo = `data:image/webp;base64,${compressedBuffer.toString('base64')}`;

        await studentRef.update({
            photo: base64Photo,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // LOG THE ACTION
        await logAudit(usn, 'UPDATE_PHOTO', { photo_size: req.file.size }, req);

        res.json({ success: true, photoUrl: base64Photo });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Admin endpoint: Batch upload photos
app.post('/api/admin/batch-upload-photos', async (req, res) => {
    try {
        const { updates } = req.body;

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'Updates array required' });
        }

        let successCount = 0;
        let failCount = 0;

        for (const update of updates) {
            try {
                const { usn, url } = update;

                // Download image
                const imageResponse = await axios.get(url, {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    }
                });

                // Compress to WebP
                const compressedBuffer = await sharp(imageResponse.data)
                    .resize(400, 400, { fit: 'cover', withoutEnlargement: true })
                    .webp({ quality: 85 })
                    .toBuffer();

                const base64Photo = `data:image/webp;base64,${compressedBuffer.toString('base64')}`;

                // Update database
                await db.collection('students').doc(usn).update({
                    photo: base64Photo,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                successCount++;
            } catch (error) {
                console.error(`Failed to update ${update.name}:`, error.message);
                failCount++;
            }
        }

        res.json({ success: successCount, failed: failCount });

    } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({ error: 'Batch upload failed' });
    }
});

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running: http://localhost:${PORT}`);
});

module.exports = app;
