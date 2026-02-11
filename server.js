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
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
    }
} catch (e) {
    console.warn("Firebase Admin Init Warning:", e.message);
}
const db = admin.apps.length ? admin.firestore() : null;

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

let storedPasswordHash = null;

(async () => {
    storedPasswordHash = await bcrypt.hash('123456778', 12);
})();

const otpStore = new Map();
const carpoolSessions = new Map();
const carpoolRequests = [];
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

function cleanOldEntries() {
    const now = Date.now();
    for (const [usn, entry] of otpStore.entries()) {
        if (entry.expiresAt <= now) otpStore.delete(usn);
    }
    for (const [token, entry] of carpoolSessions.entries()) {
        if (entry.expiresAt <= now) carpoolSessions.delete(token);
    }
    const cutoff = now - (6 * 60 * 60 * 1000);
    while (carpoolRequests.length && carpoolRequests[0].createdAt < cutoff) {
        carpoolRequests.shift();
    }
}

function buildMatches() {
    cleanOldEntries();
    const matches = [];
    for (let i = 0; i < carpoolRequests.length; i += 1) {
        for (let j = i + 1; j < carpoolRequests.length; j += 1) {
            const a = carpoolRequests[i];
            const b = carpoolRequests[j];
            if (a.direction !== b.direction) continue;
            const maxWindow = 20 + Math.min(a.waitMinutes, b.waitMinutes);
            if (minutesDiff(a.time, b.time) > maxWindow) continue;
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

function getActiveRequestsCount() {
    cleanOldEntries();
    return carpoolRequests.length;
}

function publishMatches() {
    const matches = buildMatches();
    const payload = JSON.stringify({
        matches: matches.map(match => ({
            id: match.id,
            direction: match.direction,
            time: match.time,
            wait: match.wait,
            name: `Student ${match.users[1].usn.slice(-4)}`
        })),
        activeRequests: getActiveRequestsCount(),
        matchCount: matches.length
    });
    for (const res of sseClients) {
        res.write(`data: ${payload}\n\n`);
    }
}

function requireCarpoolSession(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || !carpoolSessions.has(token)) {
        return res.status(401).json({ error: 'Verification required' });
    }
    const session = carpoolSessions.get(token);
    if (session.expiresAt <= Date.now()) {
        carpoolSessions.delete(token);
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
        const { usn } = req.body || {};
        if (!usn) return res.status(400).json({ error: 'USN required' });

        let email = null;

        // Fetch from Firebase
        let name = null;
        let photo = null;

        if (db) {
            try {
                // Try query by field 'usn'
                const snapshot = await db.collection('students').where('usn', '==', usn).limit(1).get();
                if (!snapshot.empty) {
                    const data = snapshot.docs[0].data();
                    email = data.email;
                    name = data.name;
                    photo = data.photo;
                } else {
                    // Try checking if doc ID is the USN
                    const doc = await db.collection('students').doc(usn).get();
                    if (doc.exists) {
                        const data = doc.data();
                        email = data.email;
                        name = data.name;
                        photo = data.photo;
                    }
                }
            } catch (err) {
                console.error("Firebase fetch error:", err);
            }
        }

        // Fallback or enforcement if not found in DB
        if (!email) {
            email = `${usn}@svyasa-sas.edu.in`;
        }

        // Mock email sending if no mailer configured (for dev/demo)
        if (!mailer) {
            console.log(`[DEV MODE] OTP for ${email}: 123456`);
        }

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
            console.log(`OTP for ${usn} (${email}): ${otp}`);
        }

        res.json({ success: true, message: `OTP sent to ...${email.split('@')[1]}` });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'OTP send failed' });
    }
});

app.post('/api/carpool/verify-otp', apiLimiter, (req, res) => {
    const { usn, otp } = req.body || {};
    if (!usn || !otp) return res.status(400).json({ error: 'USN and OTP required' });
    const entry = otpStore.get(usn);
    if (!entry || entry.expiresAt <= Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (entry.otp !== otp) return res.status(400).json({ error: 'OTP invalid' });
    const token = makeToken();
    carpoolSessions.set(token, {
        usn,
        email: entry.email,
        name: entry.name,
        photo: entry.photo,
        expiresAt: Date.now() + 60 * 60 * 1000
    });
    otpStore.delete(usn);
    res.json({ success: true, token, email: entry.email, name: entry.name, photo: entry.photo });
});

app.post('/api/carpool/requests', apiLimiter, requireCarpoolSession, (req, res) => {
    const { direction, flightCode, time, waitMinutes } = req.body || {};
    if (!direction || !time) return res.status(400).json({ error: 'Direction and time required' });
    const parsedTime = new Date(time);
    if (Number.isNaN(parsedTime.getTime())) return res.status(400).json({ error: 'Invalid time' });
    const request = {
        id: makeToken(),
        usn: req.carpoolUser.usn,
        email: req.carpoolUser.email,
        name: req.carpoolUser.name,
        photo: req.carpoolUser.photo,
        direction,
        flightCode: (flightCode || '').trim(),
        time: parsedTime,
        waitMinutes: Math.max(0, Number(waitMinutes || 0)),
        createdAt: Date.now()
    };
    carpoolRequests.push(request);
    publishMatches();
    res.json({ success: true, requestId: request.id });
});

app.get('/api/carpool/status', apiLimiter, (req, res) => {
    const matches = buildMatches();
    res.json({
        activeRequests: getActiveRequestsCount(),
        matchCount: matches.length
    });
});

app.get('/api/carpool/public-requests', apiLimiter, (req, res) => {
    // Filter active requests
    const now = Date.now();
    const active = carpoolRequests.filter(r => r.time.getTime() > now - 3600000); // e.g. not older than 1 hour past

    res.json({
        requests: active.map(r => ({
            id: r.id,
            name: r.name || `Student ${r.usn.slice(-4)}`,
            photo: r.photo,
            direction: r.direction,
            time: r.time,
            flightCode: r.flightCode
        }))
    });
});

app.get('/api/carpool/matches', apiLimiter, (req, res) => {
    const matches = buildMatches();
    res.json({
        matches: matches.map(match => ({
            id: match.id,
            direction: match.direction,
            time: match.time,
            wait: match.wait,
            name: `Student ${match.users[1].usn.slice(-4)}`
        })),
        activeRequests: getActiveRequestsCount(),
        matchCount: matches.length
    });
});

app.post('/api/carpool/accept', apiLimiter, requireCarpoolSession, async (req, res) => {
    try {
        const { matchId } = req.body || {};
        if (!matchId) return res.status(400).json({ error: 'Match required' });
        const match = buildMatches().find(item => item.id === matchId);
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
    res.write(`data: ${JSON.stringify({
        matches: [],
        activeRequests: getActiveRequestsCount(),
        matchCount: 0
    })}\n\n`);
    publishMatches();

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
