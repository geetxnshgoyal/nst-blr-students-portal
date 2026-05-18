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
let adminOtpEntry = null;

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

let firestore = null;
try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && privateKey) {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey: privateKey.replace(/\\n/g, '\n')
                })
            });
        }
        firestore = admin.firestore();
    }
} catch (e) {
    firestore = null;
}

function sanitizeStudents(students) {
    return students.map(student => {
        const { abc_id, ...rest } = student;
        return rest;
    });
}

function loadStudentsFromFile() {
    const data = fs.readFileSync(path.join(__dirname, 'students.json'), 'utf8');
    const students = JSON.parse(data);
    return sanitizeStudents(students);
}

async function loadStudentsFromFirestore() {
    if (!firestore) return null;
    const snapshot = await firestore.collection('students').get();
    const students = [];
    snapshot.forEach(doc => {
        const record = doc.data() || {};
        if (!record.usn) record.usn = doc.id;
        students.push(record);
    });
    students.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return sanitizeStudents(students);
}

function makeToken() {
    return crypto.randomBytes(24).toString('hex');
}

function minutesDiff(a, b) {
    return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function cleanOldEntries() {
    const now = Date.now();
    for (const [key, entry] of otpStore.entries()) {
        if (entry.expiresAt <= now) otpStore.delete(key);
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
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
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

app.post('/api/admin/login', authLimiter, async (req, res) => {
    try {
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        adminOtpEntry = {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000
        };

        if (mailer && process.env.SMTP_FROM) {
            await mailer.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to: process.env.SMTP_USER,
                subject: 'NST Admin OTP',
                text: `Your admin OTP is ${otp}. It expires in 10 minutes.`
            });
        }

        res.json({
            success: true,
            message: 'Verification code sent. Please enter OTP to continue.'
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

app.post('/api/admin/verify', authLimiter, (req, res) => {
    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP required' });
    if (!adminOtpEntry || adminOtpEntry.expiresAt <= Date.now()) {
        return res.status(400).json({ error: 'OTP expired. Request a new code.' });
    }
    if (String(otp).trim() !== adminOtpEntry.otp) {
        return res.status(400).json({ error: 'Invalid OTP' });
    }

    adminOtpEntry = null;
    const token = jwt.sign({ admin: true, t: Date.now() }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
});

app.get('/api/admin/students', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const firebaseStudents = await loadStudentsFromFirestore();
        const students = firebaseStudents || loadStudentsFromFile();
        res.json({ success: true, students });
    } catch (e) {
        try {
            const fallbackStudents = loadStudentsFromFile();
            res.json({ success: true, students: fallbackStudents });
        } catch (fallbackError) {
            res.status(500).json({ error: 'Error loading data' });
        }
    }
});

app.post('/api/portal/request-otp', apiLimiter, async (req, res) => {
    try {
        const { usn } = req.body || {};
        if (!usn) return res.status(400).json({ error: 'USN required' });
        if (!/^[0-9]{10}$/.test(usn)) return res.status(400).json({ error: 'Invalid USN' });

        let students = await loadStudentsFromFirestore() || loadStudentsFromFile();
        const student = students.find(s => s.usn === usn);

        if (!student) return res.status(404).json({ error: 'Student not found' });

        const email = student.institutional_email || student.email;
        if (!email) return res.status(400).json({ error: 'No email found for student' });

        if (!mailer) return res.status(503).json({ error: 'Email service offline' });

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        otpStore.set(usn + "_portal", { otp, email, expiresAt: Date.now() + 10 * 60 * 1000 });

        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'NST Portal OTP',
            text: `Your NST portal login OTP is ${otp}. It expires in 10 minutes.`
        });

        res.json({ success: true, emailHint: email.replace(/(.{2})(.*)(@.*)/, '$1***$3') });
    } catch (e) {
        res.status(500).json({ error: 'OTP send failed' });
    }
});

app.post('/api/portal/verify-otp', apiLimiter, async (req, res) => {
    try {
        const { usn, otp } = req.body || {};
        if (!usn || !otp) return res.status(400).json({ error: 'USN and OTP required' });

        const entry = otpStore.get(usn + "_portal");
        if (!entry || entry.expiresAt <= Date.now()) return res.status(400).json({ error: 'OTP expired' });
        if (entry.otp !== otp) return res.status(400).json({ error: 'OTP invalid' });

        otpStore.delete(usn + "_portal");

        let students = await loadStudentsFromFirestore() || loadStudentsFromFile();
        const student = students.find(s => s.usn === usn);

        if (!student) return res.status(404).json({ error: 'Student not found' });

        const token = jwt.sign({ usn, student: true, t: Date.now() }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ success: true, token, student });
    } catch (e) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/api/carpool/request-otp', apiLimiter, async (req, res) => {
    try {
        const { usn, email } = req.body || {};
        if (!usn || !email) return res.status(400).json({ error: 'USN and email required' });
        if (!/^[0-9]{10}$/.test(usn)) return res.status(400).json({ error: 'Invalid USN' });
        if (!mailer) return res.status(503).json({ error: 'Email service offline' });
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        otpStore.set(usn + "_carpool", { otp, email, expiresAt: Date.now() + 10 * 60 * 1000 });
        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'NST Carpool OTP',
            text: `Your NST carpool OTP is ${otp}. It expires in 10 minutes.`
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'OTP send failed' });
    }
});

app.post('/api/carpool/verify-otp', apiLimiter, (req, res) => {
    const { usn, otp } = req.body || {};
    if (!usn || !otp) return res.status(400).json({ error: 'USN and OTP required' });
    const entry = otpStore.get(usn + "_carpool");
    if (!entry || entry.expiresAt <= Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (entry.otp !== otp) return res.status(400).json({ error: 'OTP invalid' });
    const token = makeToken();
    carpoolSessions.set(token, {
        usn,
        email: entry.email,
        expiresAt: Date.now() + 60 * 60 * 1000
    });
    otpStore.delete(usn + "_carpool");
    res.json({ success: true, token, email: entry.email });
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
        const firebaseStudents = await loadStudentsFromFirestore();
        if (firebaseStudents) return res.json(firebaseStudents);
        const fallbackStudents = loadStudentsFromFile();
        res.json(fallbackStudents);
    } catch (e) {
        try {
            const fallbackStudents = loadStudentsFromFile();
            return res.json(fallbackStudents);
        } catch (fallbackError) {
            return res.status(500).json({ error: 'Error loading data' });
        }
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
