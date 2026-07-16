const fs = require('node:fs');
const path = require('node:path');

function loadEnvFileFallback() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;

    const envContent = fs.readFileSync(envPath, 'utf8');

    for (const rawLine of envContent.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = line.slice(0, separatorIndex).trim();
        let value = line.slice(separatorIndex + 1).trim();

        if (!key || Object.hasOwn(process.env, key)) continue;

        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        process.env[key] = value.replaceAll('\\n', '\n');
    }
}

try {
    require('dotenv').config();
} catch {
    loadEnvFileFallback();
}

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const crypto = require('node:crypto');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');

let storedPasswordHash = null;

(async () => {
    storedPasswordHash = await bcrypt.hash('123456778', 12);
})();

const otpStore = new Map();
const carpoolSessions = new Map();
const carpoolRequests = [];
const sseClients = new Set();
let adminOtpEntry = null;
const ADMIN_DEFAULT_OTP = process.env.ADMIN_DEFAULT_OTP;

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
        const apps = getApps();
        if (!apps || !apps.length) {
            initializeApp({
                credential: cert({
                    projectId,
                    clientEmail,
                    privateKey: privateKey.replaceAll('\\n', '\n')
                })
            });
        }
        firestore = getFirestore();
    }
} catch (e) {
    console.error("Firestore init error:", e);
    firestore = null;
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
    return students;
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
    cleanOldEntries();
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
        matchCount: matches.length,
        publicRequests: carpoolRequests.map(r => ({
            id: r.id,
            name: r.name || `Student ${String(r.usn || '0000').slice(-4)}`,
            photo: r.photo || '',
            direction: r.direction,
            time: r.time,
            flightCode: r.flightCode
        }))
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
    const token = authHeader?.split(' ')[1];
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
    const blocked = ['/students_cleaned_year2.json', '/abc.txt', '/server.js', '/package.json', '/package-lock.json', '/.env'];
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
        console.error("Login error:", e);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admin/login', authLimiter, async (req, res) => {
    try {
        const otp = String(crypto.randomInt(100000, 1000000));
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
        console.error("Admin verification send failed:", e);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

app.post('/api/admin/verify', authLimiter, (req, res) => {
    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP required' });

    // Allow default admin OTP to bypass email verification
    const isDefaultOtp = ADMIN_DEFAULT_OTP && String(otp).trim() === ADMIN_DEFAULT_OTP;

    if (!isDefaultOtp) {
        if (!adminOtpEntry || adminOtpEntry.expiresAt <= Date.now()) {
            return res.status(400).json({ error: 'OTP expired. Request a new code.' });
        }
        if (String(otp).trim() !== adminOtpEntry.otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
    }

    adminOtpEntry = null;
    const token = jwt.sign({ admin: true, t: Date.now() }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ success: true, token });
});

app.get('/api/admin/students', apiLimiter, authenticateToken, async (req, res) => {
    try {
        const firebaseStudents = await loadStudentsFromFirestore();
        if (!firebaseStudents) {
            return res.status(500).json({ error: 'Database service offline' });
        }
        res.json({ success: true, students: firebaseStudents });
    } catch (e) {
        console.error("Firestore get students error:", e);
        res.status(500).json({ error: 'Error loading data' });
    }
});

app.post('/api/portal/request-otp', apiLimiter, async (req, res) => {
    try {
        const { usn } = req.body || {};
        if (!usn) return res.status(400).json({ error: 'USN required' });
        if (!/^\d{10}$/.test(usn)) return res.status(400).json({ error: 'Invalid USN' });

        let students = await loadStudentsFromFirestore();
        if (!students) return res.status(500).json({ error: 'Database service offline' });
        const student = students.find(s => s.usn === usn);

        if (!student || student.status === 'left') return res.status(404).json({ error: 'Student not found' });

        const email = student.institutional_email || student.email;
        if (!email) return res.status(400).json({ error: 'No email found for student' });

        if (!mailer) return res.status(503).json({ error: 'Email service offline' });

        const otp = String(crypto.randomInt(100000, 1000000));
        otpStore.set(usn + "_portal", { otp, email, expiresAt: Date.now() + 10 * 60 * 1000 });

        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'NST Portal OTP',
            text: `Your NST portal login OTP is ${otp}. It expires in 10 minutes.`
        });

        res.json({ success: true, emailHint: email.replace(/(.{2})([^@]*)(@.*)/, '$1***$3') });
    } catch (e) {
        console.error("Portal OTP send error:", e);
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

        let students = await loadStudentsFromFirestore();
        if (!students) return res.status(500).json({ error: 'Database service offline' });
        const student = students.find(s => s.usn === usn);

        if (!student) return res.status(404).json({ error: 'Student not found' });

        const token = jwt.sign({ usn, student: true, t: Date.now() }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ success: true, token, student });
    } catch (e) {
        console.error("Portal verification failed:", e);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/api/carpool/request-otp', apiLimiter, async (req, res) => {
    try {
        const { usn } = req.body || {};
        if (!usn) return res.status(400).json({ error: 'USN required' });
        if (!/^\d{10}$/.test(usn)) return res.status(400).json({ error: 'Invalid USN' });

        let students = await loadStudentsFromFirestore();
        if (!students) return res.status(500).json({ error: 'Database service offline' });
        const student = students.find(s => s.usn === usn);

        if (!student || student.status === 'left') return res.status(404).json({ error: 'Student not found' });

        const email = student.institutional_email || student.email;
        if (!email) return res.status(400).json({ error: 'No email found for student' });

        if (!mailer) return res.status(503).json({ error: 'Email service offline' });

        const otp = String(crypto.randomInt(100000, 1000000));
        otpStore.set(usn + "_carpool", { otp, email, expiresAt: Date.now() + 10 * 60 * 1000 });

        await mailer.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'NST Carpool OTP',
            text: `Your NST carpool OTP is ${otp}. It expires in 10 minutes.`
        });

        const obscuredEmail = email.replace(/(.{2})([^@]*)(@.*)/, '$1***$3');
        res.json({ success: true, message: `OTP sent to ${obscuredEmail}` });
    } catch (e) {
        console.error("Carpool OTP send failed:", e);
        res.status(500).json({ error: 'OTP send failed' });
    }
});

app.post('/api/carpool/verify-otp', apiLimiter, async (req, res) => {
    const { usn, otp } = req.body || {};
    if (!usn || !otp) return res.status(400).json({ error: 'USN and OTP required' });
    const entry = otpStore.get(usn + "_carpool");
    if (!entry || entry.expiresAt <= Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (entry.otp !== otp) return res.status(400).json({ error: 'OTP invalid' });

    let name = `Student ${usn.slice(-4)}`;
    let photo = '';
    try {
        const students = await loadStudentsFromFirestore();
        if (students) {
            const student = students.find(s => s.usn === usn);
            if (student) {
                name = student.name || name;
                photo = student.photo || photo;
            }
        }
    } catch (e) {
        console.error("Failed to load student name/photo", e);
    }

    const token = makeToken();
    carpoolSessions.set(token, {
        usn,
        email: entry.email,
        name,
        photo,
        expiresAt: Date.now() + 60 * 60 * 1000
    });
    otpStore.delete(usn + "_carpool");
    res.json({ success: true, token, email: entry.email, name, photo });
});

app.post('/api/carpool/requests', apiLimiter, requireCarpoolSession, (req, res) => {
    const { direction, flightCode, time, waitMinutes } = req.body || {};
    if (!direction || !time) return res.status(400).json({ error: 'Direction and time required' });
    const parsedTime = new Date(time);
    if (Number.isNaN(parsedTime.getTime())) return res.status(400).json({ error: 'Invalid time' });

    const existingIndex = carpoolRequests.findIndex(r => r.usn === req.carpoolUser.usn);
    if (existingIndex !== -1) {
        carpoolRequests.splice(existingIndex, 1);
    }

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

app.get('/api/carpool/public-requests', apiLimiter, requireCarpoolSession, (req, res) => {
    cleanOldEntries();
    const hasRequest = carpoolRequests.some(r => r.usn === req.carpoolUser.usn);
    if (!hasRequest) {
        return res.json({
            requests: [],
            locked: true,
            message: "Please join a journey to see other travelers."
        });
    }

    res.json({
        requests: carpoolRequests.map(r => ({
            id: r.id,
            name: r.name || `Student ${String(r.usn || '0000').slice(-4)}`,
            photo: r.photo || '',
            direction: r.direction,
            time: r.time,
            flightCode: r.flightCode
        }))
    });
});

app.get('/api/carpool/matches', apiLimiter, requireCarpoolSession, (req, res) => {
    const allMatches = buildMatches();
    const filtered = allMatches.filter(m =>
        m.users.some(u => u.usn === req.carpoolUser.usn)
    );

    res.json({
        matches: filtered.map(match => {
            const other = match.users.find(u => u.usn !== req.carpoolUser.usn) || match.users[1];
            return {
                id: match.id,
                direction: match.direction,
                time: other.time,
                window: match.time,
                wait: match.wait,
                name: other.name || `Student ${String(other.usn || '0000').slice(-4)}`
            };
        }),
        activeRequests: getActiveRequestsCount(),
        matchCount: filtered.length
    });
});

app.post('/api/carpool/cancel', apiLimiter, requireCarpoolSession, (req, res) => {
    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ error: 'Request ID required' });

    const index = carpoolRequests.findIndex(r => r.id === requestId && r.usn === req.carpoolUser.usn);
    if (index !== -1) {
        carpoolRequests.splice(index, 1);
    }
    publishMatches();
    res.json({ success: true });
});

app.post('/api/carpool/accept', apiLimiter, requireCarpoolSession, async (req, res) => {
    try {
        const { matchId } = req.body || {};
        if (!matchId) return res.status(400).json({ error: 'Match required' });
        const matches = buildMatches();
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
        console.error("Carpool accept email send failed:", e);
        res.status(500).json({ error: 'Email send failed' });
    }
});

app.get('/api/carpool/stream', apiLimiter, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sseClients.add(res);

    const matches = buildMatches();
    res.write(`data: ${JSON.stringify({
        matches: matches.map(m => ({
            id: m.id,
            direction: m.direction,
            time: m.time,
            wait: m.wait,
            name: `Student ${String(m.users[1].usn || '0000').slice(-4)}`
        })),
        activeRequests: getActiveRequestsCount(),
        publicRequests: carpoolRequests.map(r => ({
            id: r.id,
            name: r.name || `Student ${String(r.usn || '0000').slice(-4)}`,
            photo: r.photo || '',
            direction: r.direction,
            time: r.time,
            flightCode: r.flightCode
        }))
    })}\n\n`);

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
        if (firebaseStudents) {
            const activeStudents = firebaseStudents.filter(s => s.status !== 'left');
            return res.json(activeStudents);
        }
        return res.status(500).json({ error: 'Database service offline' });
    } catch (e) {
        console.error("Firestore loading error:", e);
        return res.status(500).json({ error: 'Error loading data' });
    }
});

app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ success: true });
});

// Expose Serverless Cron trigger for Vercel / GitHub Actions
app.get('/api/cron/birthday', async (req, res) => {
    const authHeader = req.headers.authorization;
    const secretQuery = req.query.secret;
    const expectedSecret = process.env.CRON_SECRET;
    
    console.log(`[Cron Debug] expectedSecret: ${expectedSecret ? 'Defined (len: ' + String(expectedSecret).length + ')' : 'Undefined'}`);
    console.log(`[Cron Debug] secretQuery: ${secretQuery ? 'Defined (len: ' + String(secretQuery).length + ')' : 'Undefined/Empty'}`);
    console.log(`[Cron Debug] authHeader: ${authHeader ? 'Defined (len: ' + String(authHeader).length + ')' : 'Undefined/Empty'}`);

    if (expectedSecret) {
        const authorized = authHeader === `Bearer ${expectedSecret}` || secretQuery === expectedSecret;
        if (!authorized) {
            console.warn(`[Cron Debug] Authorization check failed. queryMatches: ${secretQuery === expectedSecret}, headerMatches: ${authHeader === 'Bearer ' + expectedSecret}`);
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }
    
    try {
        const { checkBirthdaysAndSendEmails } = require('./scripts/birthday-scheduler');
        await checkBirthdaysAndSendEmails(firestore, mailer, false);
        res.json({ success: true, message: 'Birthday checklist processed.' });
    } catch (err) {
        console.error('❌ Cron: Birthday trigger error:', err);
        res.status(500).json({ error: 'Failed to process birthday cron', details: err.message });
    }
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

// Start the daily birthday scheduler
try {
    const { startBirthdayScheduler } = require('./scripts/birthday-scheduler');
    startBirthdayScheduler(firestore, mailer);
} catch (schedulerError) {
    console.error('❌ Failed to start birthday scheduler:', schedulerError);
}

app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
});

module.exports = app;
