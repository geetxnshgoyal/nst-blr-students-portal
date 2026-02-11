require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const admin = require('firebase-admin');

// Initialize Firebase Admin
try {
    if (!admin.apps.length) {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;

        if (projectId && clientEmail && privateKey) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey,
                }),
            });
            console.log("Firebase Admin initialized with service account.");
        } else {
            console.warn("Firebase credentials missing in .env. Using applicationDefault().");
            admin.initializeApp({
                credential: admin.credential.applicationDefault()
            });
        }
    }
} catch (e) {
    console.error("Firebase Admin Init Error:", e.message);
}
const db = admin.apps.length ? admin.firestore() : null;

const app = express();
const PORT = process.env.PORT || 3000;

// Internal Cache for speed
let studentCache = new Map();

async function seedStudentCache() {
    if (!db) {
        console.warn("DB not ready, skipping student cache seed.");
        return;
    }
    try {
        console.log("Seeding student cache from Firestore...");
        const snapshot = await db.collection('students').get();
        snapshot.forEach(doc => {
            const data = doc.data();
            const usn = String(data.usn || doc.id).toUpperCase();
            studentCache.set(usn, data);
        });
        console.log(`Successfully cached ${studentCache.size} students from Firestore.`);
    } catch (e) {
        console.error("Error seeding student cache:", e.message);
    }
}

const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

let storedPasswordHash = null;

(async () => {
    storedPasswordHash = await bcrypt.hash('123456778', 12);
    await seedStudentCache();
})();

const otpStore = new Map();
// Removed in-memory carpoolSessions and carpoolRequests in favor of Firestore
const sseClients = new Set();

const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    } : null
};

const mailer = smtpConfig.host && smtpConfig.auth ? nodemailer.createTransport(smtpConfig) : null;

function makeToken() {
    return crypto.randomBytes(24).toString('hex');
}

function minutesDiff(a, b) {
    return Math.abs(a.getTime() - b.getTime()) / 60000;
}

// Helper to fetch active requests from Firestore
async function fetchActiveRequests() {
    if (!db) return [];
    try {
        const cutoff = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
        const snapshot = await db.collection('carpool_requests')
            .where('time', '>', cutoff)
            .orderBy('time', 'asc')
            .get();

        const requests = snapshot.docs.map(doc => doc.data());

        // Deduplicate by USN - Keep the most recently created request if multiple exist
        const unique = new Map();
        requests.forEach(r => {
            const existing = unique.get(r.usn);
            if (!existing || r.createdAt > existing.createdAt) {
                unique.set(r.usn, r);
            }
        });

        return Array.from(unique.values());
    } catch (e) {
        console.error("Error fetching requests:", e);
        return [];
    }
}

function cleanOldEntries() {
    const now = Date.now();
    for (const [usn, entry] of otpStore.entries()) {
        if (entry.expiresAt <= now) otpStore.delete(usn);
    }
}
setInterval(cleanOldEntries, 60 * 60 * 1000); // Clean every hour

// Helper to fetch session
async function getSession(token) {
    if (!db) return null;
    try {
        const doc = await db.collection('carpool_sessions').doc(token).get();
        return doc.exists ? doc.data() : null;
    } catch (e) {
        return null;
    }
}

async function buildMatches() {
    const requests = await fetchActiveRequests();
    const matches = [];
    for (let i = 0; i < requests.length; i += 1) {
        for (let j = i + 1; j < requests.length; j += 1) {
            const a = requests[i];
            const b = requests[j];

            // Basic matching logic
            if (a.direction !== b.direction) continue;
            if (a.usn === b.usn) continue; // No self-matching

            const maxWindow = 20 + Math.min(a.waitMinutes, b.waitMinutes);
            if (minutesDiff(new Date(a.time), new Date(b.time)) > maxWindow) continue;

            matches.push({
                id: `${a.id}-${b.id}`,
                direction: a.direction,
                time: `${maxWindow} min window`,
                wait: `Wait ${Math.min(a.waitMinutes, b.waitMinutes)} min`,
                users: [a, b]
            });
        }
    }
    return matches;
}

async function getActiveRequestsCount() {
    const requests = await fetchActiveRequests();
    return requests.length;
}

async function publishMatches() {
    const matches = await buildMatches();
    const count = await getActiveRequestsCount();
    const payload = JSON.stringify({
        matches: matches.map(match => ({
            id: match.id,
            direction: match.direction,
            time: match.time,
            wait: match.wait,
            name: `Student ${match.users[1].usn.slice(-4)}`
        })),
        activeRequests: count,
        matchCount: matches.length
    });
    for (const res of sseClients) {
        res.write(`data: ${payload}\n\n`);
    }
}

async function requireCarpoolSession(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) return res.status(401).json({ error: 'Verification required' });

    const session = await getSession(token);

    if (!session) {
        return res.status(401).json({ error: 'Session not found' });
    }
    if (session.expiresAt <= Date.now()) {
        // Optional: delete from DB
        return res.status(401).json({ error: 'Verification expired' });
    }
    req.carpoolUser = session;
    next();
}

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
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

app.use(express.json());

app.use('/api', (req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store'
    });
    next();
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many attempts' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: 'Rate limit exceeded' },
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

app.use((req, res, next) => {
    if (req.path.endsWith('.json') || req.path.endsWith('.txt')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

app.use((req, res, next) => {
    const blocked = ['/students.json', '/abc.txt', '/server.js', '/package.json', '/package-lock.json', '/.env'];
    if (blocked.includes(req.path.toLowerCase())) {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    index: 'index.html',
    dotfiles: 'deny'
}));

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Password required' });
        const isValid = await bcrypt.compare(password, storedPasswordHash);
        if (!isValid) {
            await new Promise(r => setTimeout(r, 1000));
            return res.status(401).json({ error: 'Invalid password' });
        }
        const token = jwt.sign({ a: true, t: Date.now() }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ success: true, token });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/carpool/request-otp', apiLimiter, async (req, res) => {
    try {
        let { usn } = req.body || {};
        if (!usn) return res.status(400).json({ error: 'USN required' });
        usn = usn.trim().toUpperCase();

        // 1. Check Cache (Instant)
        let studentData = studentCache.get(usn);

        // 2. Try Firestore if not in cache or to refresh data
        if (db) {
            try {
                // Short timeout for DB lookup to keep UI snappy
                const doc = await db.collection('students').doc(usn).get();
                if (doc.exists) {
                    studentData = { ...(studentData || {}), ...doc.data() };
                    studentCache.set(usn, studentData); // Refresh cache
                }
            } catch (e) {
                console.warn("Firestore lookup failed, relying on cache/defaults.");
            }
        }

        if (!studentData && !usn.startsWith('21')) { // Basic USN validation if totally unknown
            return res.status(404).json({ error: 'Student not found.' });
        }

        const email = studentData?.email || studentData?.institutional_email || `${usn}@svyasa-sas.edu.in`;
        const name = studentData?.name || 'Student';
        const photo = studentData?.photo || '';

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        otpStore.set(usn, { otp, email, name, photo, expiresAt: Date.now() + 10 * 60 * 1000 });

        if (mailer) {
            await mailer.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: email,
                subject: 'NST Carpool OTP',
                text: `Your NST carpool OTP is ${otp}. It expires in 10 minutes.`
            });
        } else {
            console.log(`[DEV] OTP for ${usn}: ${otp}`);
        }

        res.json({ success: true, message: `OTP sent to ...${email.split('@')[1]}` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/carpool/verify-otp', apiLimiter, async (req, res) => {
    let { usn, otp } = req.body || {};
    if (!usn || !otp) return res.status(400).json({ error: 'USN and OTP required' });
    usn = usn.trim().toUpperCase();
    const entry = otpStore.get(usn);
    if (!entry || entry.expiresAt <= Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (entry.otp !== otp) return res.status(400).json({ error: 'OTP invalid' });
    const token = makeToken();
    const sessionData = {
        usn,
        email: entry.email,
        name: entry.name,
        photo: entry.photo,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000 // Extended session for persistence
    };

    // Save session to Firestore
    if (db) {
        try {
            await db.collection('carpool_sessions').doc(token).set(sessionData);
        } catch (e) {
            console.error("Session save error", e);
        }
    }

    otpStore.delete(usn);
    res.json({
        success: true,
        token,
        email: entry.email,
        name: entry.name,
        photo: entry.photo
    });
});

// Admin Portal Endpoints
app.post('/api/admin/login', authLimiter, async (req, res) => {
    try {
        const adminEmail = process.env.SMTP_USER;
        if (!adminEmail) return res.status(500).json({ error: 'Admin email not configured' });

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        otpStore.set('admin_portal', { otp, email: adminEmail, expiresAt: Date.now() + 10 * 60 * 1000 });

        if (mailer) {
            await mailer.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: adminEmail,
                subject: 'Admin Portal Access Code',
                text: `Your Admin Portal verification code is ${otp}.`
            });
            res.json({ success: true, message: `Code sent to ${adminEmail}` });
        } else {
            console.log(`Admin OTP: ${otp}`);
            res.json({ success: true, message: 'OTP logged to server console (Dev Mode)' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to send admin OTP' });
    }
});

app.post('/api/admin/verify', authLimiter, (req, res) => {
    const { otp } = req.body || {};
    const entry = otpStore.get('admin_portal');

    if (!entry || entry.expiresAt <= Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (entry.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    const token = jwt.sign({ admin: true, t: Date.now() }, JWT_SECRET, { expiresIn: '8h' });
    otpStore.delete('admin_portal');
    res.json({ success: true, token });
});

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err || !decoded.admin) return res.status(403).json({ error: 'Forbidden' });
        req.admin = decoded;
        next();
    });
}

app.get('/api/admin/students', apiLimiter, authenticateAdmin, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database offline' });
        const snapshot = await db.collection('students').get();
        const students = snapshot.docs.map(doc => doc.data());
        res.json({ success: true, students });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch students' });
    }
});

app.post('/api/carpool/requests', apiLimiter, requireCarpoolSession, async (req, res) => {
    const { direction, flightCode, time, waitMinutes } = req.body || {};
    if (!direction || !time) return res.status(400).json({ error: 'Direction and time required' });
    // Force IST if no offset provided (datetime-local usually sends YYYY-MM-DDTHH:MM)
    const istTime = time.includes('+') || time.endsWith('Z') ? time : `${time}:00+05:30`;
    const parsedTime = new Date(istTime);
    if (Number.isNaN(parsedTime.getTime())) return res.status(400).json({ error: 'Invalid time' });
    const request = {
        id: makeToken(),
        usn: req.carpoolUser.usn,
        email: req.carpoolUser.email,
        name: req.carpoolUser.name,
        photo: req.carpoolUser.photo,
        direction,
        flightCode: (flightCode || '').trim(),
        time: parsedTime.toISOString(), // Save as string in DB
        waitMinutes: Math.max(0, Number(waitMinutes || 0)),
        createdAt: Date.now()
    };

    // Save to Firestore
    if (db) {
        try {
            await db.collection('carpool_requests').doc(request.id).set(request);
        } catch (e) {
            console.error("Request save error", e);
            return res.status(500).json({ error: 'Database error' });
        }
    }

    // Publish update
    publishMatches(); // This is async now but we don't await it to return fast
    res.json({ success: true, requestId: request.id });
});

app.get('/api/carpool/status', apiLimiter, async (req, res) => {
    try {
        const matches = await buildMatches();
        const count = await getActiveRequestsCount();
        res.json({
            activeRequests: count,
            matchCount: matches.length
        });
    } catch (e) {
        res.status(500).json({ error: 'Error fetching status' });
    }
});

app.get('/api/carpool/public-requests', apiLimiter, requireCarpoolSession, async (req, res) => {
    try {
        const requests = await fetchActiveRequests();

        // Gatekeeping: Check if current user has an active request
        const hasRequest = requests.some(r => r.usn === req.carpoolUser.usn);

        if (!hasRequest) {
            return res.json({
                requests: [],
                locked: true,
                message: "Please join a journey to see other travelers."
            });
        }

        res.json({
            requests: requests.map(r => ({
                id: r.id,
                name: r.name || `Student ${r.usn.slice(-4)}`,
                photo: r.photo,
                direction: r.direction,
                time: r.time,
                flightCode: r.flightCode
            }))
        });
    } catch (e) {
        res.status(500).json({ error: 'Error fetching board' });
    }
});

app.get('/api/carpool/matches', apiLimiter, requireCarpoolSession, async (req, res) => {
    try {
        const allMatches = await buildMatches();
        const myRequests = await db.collection('carpool_requests').where('usn', '==', req.carpoolUser.usn).get();
        const myRequestIds = myRequests.docs.map(d => d.id);

        const filtered = allMatches.filter(m =>
            m.users.some(u => u.usn === req.carpoolUser.usn)
        );

        res.json({
            matches: filtered.map(match => {
                const other = match.users.find(u => u.usn !== req.carpoolUser.usn) || match.users[1];
                return {
                    id: match.id,
                    direction: match.direction,
                    time: match.time,
                    wait: match.wait,
                    name: other.name || `Student ${other.usn.slice(-4)}`
                };
            }),
            activeRequests: await getActiveRequestsCount(),
            matchCount: filtered.length
        });
    } catch (e) {
        res.status(500).json({ error: 'Error' });
    }
});

app.post('/api/carpool/cancel', apiLimiter, requireCarpoolSession, async (req, res) => {
    try {
        const { requestId } = req.body || {};
        if (!requestId) return res.status(400).json({ error: 'Request ID required' });

        if (db) {
            await db.collection('carpool_requests').doc(requestId).delete();
        }
        publishMatches();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Cancel failed' });
    }
});

app.post('/api/carpool/accept', apiLimiter, requireCarpoolSession, async (req, res) => {
    try {
        const { matchId } = req.body || {};
        if (!matchId) return res.status(400).json({ error: 'Match required' });
        const matches = await buildMatches();
        const match = matches.find(item => item.id === matchId);
        if (!match) return res.status(404).json({ error: 'Match not found' });
        if (!mailer) return res.status(503).json({ error: 'Email service offline' });
        const requester = req.carpoolUser;
        const other = match.users.find(user => user.usn !== requester.usn) || match.users[0];
        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: other.email,
            subject: 'NST Carpool match accepted',
            text: `Hi! ${requester.usn} accepted the ride match. Contact: ${requester.email}.`
        });
        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: requester.email,
            subject: 'NST Carpool match sent',
            text: `We sent your contact to ${other.usn}. Their email: ${other.email}.`
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Email send failed' });
    }
});

app.get('/api/carpool/stream', apiLimiter, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);
    getActiveRequestsCount().then(count => {
        res.write(`data: ${JSON.stringify({
            matches: [],
            activeRequests: count,
            matchCount: 0
        })}\n\n`);
    });
    // publishMatches(); // don't block


    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 20000);
    req.on('close', () => {
        clearInterval(keepAlive);
        sseClients.delete(res);
    });
});

app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({ valid: true });
});

app.get('/api/students', apiLimiter, authenticateToken, async (req, res) => {
    try {
        let students = [];

        // Fetch from Firebase
        if (db) {
            try {
                const snapshot = await db.collection('students').get();
                if (!snapshot.empty) {
                    students = snapshot.docs.map(doc => doc.data());
                }
            } catch (err) {
                console.error("Firebase fetch error:", err);
            }
        }

        // Fallback to JSON if Firebase returned nothing or failed
        if (students.length === 0) {
            try {
                const data = fs.readFileSync(path.join(__dirname, 'students.json'), 'utf8');
                students = JSON.parse(data);
            } catch (e) {
                // Ignore if JSON missing, just return empty list or what we have
            }
        }

        const sanitized = students.map(s => {
            const { abc_id, ...rest } = s;
            return rest;
        });
        res.json(sanitized);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error loading data' });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true });
});

app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

app.get('*', (req, res) => {
    if (req.path.includes('..') || req.path.includes('//')) {
        return res.status(403).json({ error: 'Access denied' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
});

module.exports = app;
