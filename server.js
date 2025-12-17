const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');

let storedPasswordHash = null;

(async () => {
    storedPasswordHash = await bcrypt.hash('12345678@', 12);
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

app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({ valid: true });
});

app.get('/api/students', apiLimiter, authenticateToken, (req, res) => {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'students.json'), 'utf8');
        const students = JSON.parse(data);
        const sanitized = students.map(s => {
            const { abc_id, ...rest } = s;
            return rest;
        });
        res.json(sanitized);
    } catch (e) {
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
