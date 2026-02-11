
const API_BASE = '/api/carpool';

// State
let state = {
    token: localStorage.getItem('cp_token') || null,
    usn: localStorage.getItem('cp_usn') || null,
    email: localStorage.getItem('cp_email') || null,
    name: localStorage.getItem('cp_name') || null,
    photo: localStorage.getItem('cp_photo') || null,
    direction: null, // 'hostel' or 'airport'
    requestId: localStorage.getItem('cp_req_id') || null,
    matches: []
};


// DOM Elements
const views = {
    auth: document.getElementById('auth-view'),
    dashboard: document.getElementById('dashboard-view')
};

const forms = {
    login: document.getElementById('login-form'),
    otp: document.getElementById('otp-form'),
    trip: document.getElementById('create-request-form')
};

const inputs = {
    usn: document.getElementById('usn-input'),
    otp: document.getElementById('otp-input'),
    time: document.getElementById('time-input'),
    flight: document.getElementById('flight-input'),
    wait: document.getElementById('wait-input')
};

const sections = {
    selector: document.getElementById('trip-selector'),
    form: document.getElementById('trip-details-form'),
    board: document.getElementById('status-board')
};

const status = {
    login: document.getElementById('login-status'),
    otp: document.getElementById('otp-status')
};

// Init
function init() {
    if (state.token) {
        showDashboard();
    } else {
        showAuth();
    }

    // Set min date to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    inputs.time.min = now.toISOString().slice(0, 16);
}

// Navigation / View Logic
function showAuth() {
    views.auth.classList.add('active');
    views.dashboard.classList.remove('active');
    forms.login.classList.add('active');
    forms.otp.classList.remove('active');
}

function showDashboard() {
    views.auth.classList.remove('active');
    views.dashboard.classList.add('active');

    const savedName = localStorage.getItem('cp_name');
    const savedPhoto = localStorage.getItem('cp_photo');
    const savedEmail = localStorage.getItem('cp_email');

    // Optimistic UI Update
    document.getElementById('user-usn').textContent = state.name || savedName || state.usn || 'Student';
    document.getElementById('user-email').textContent = state.email || savedEmail || '';

    // Avatar
    const avatarEl = document.getElementById('user-avatar');
    const photoUrl = state.photo || savedPhoto;

    if (photoUrl) {
        avatarEl.innerHTML = `<img src="${photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
        avatarEl.textContent = (state.usn || 'U').slice(-2);
    }

    if (state.requestId) {
        showBoard();
    } else {
        showSelector();
    }
    startDashboardServices();
}

function showSelector() {
    document.getElementById('home-dashboard').classList.remove('hidden');
    // Gatekeeping: Hide public board until they join
    document.getElementById('public-board-container').classList.add('hidden');
    sections.form.classList.add('hidden');
    sections.board.classList.add('hidden');
}

function showForm() {
    document.getElementById('home-dashboard').classList.add('hidden');
    document.getElementById('public-board-container').classList.add('hidden');
    sections.form.classList.remove('hidden');
    sections.board.classList.add('hidden');

    const title = state.direction === 'hostel' ? 'Details: Going to Hostel' : 'Details: Going to Airport';
    const timeLabel = state.direction === 'hostel' ? 'Landing Time @ BLR' : 'Pickup Time @ Campus';

    document.getElementById('form-title').textContent = title;
    document.getElementById('time-label').textContent = timeLabel;
}

function showBoard() {
    document.getElementById('home-dashboard').classList.add('hidden');
    document.getElementById('public-board-container').classList.remove('hidden');
    sections.form.classList.add('hidden');
    sections.board.classList.remove('hidden');
    // startDashboardServices is called by showDashboard
}

// Auth Handlers
forms.login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usn = inputs.usn.value.trim();
    if (!usn) return;

    const btn = forms.login.querySelector('button');
    btn.disabled = true;
    setStatus(status.login, 'Finding student...', 'neutral');

    try {
        const res = await fetch(`${API_BASE}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usn })
        });
        const data = await res.json();

        if (data.success) {
            state.usn = usn;
            setStatus(status.login, '', 'neutral');
            document.getElementById('email-hint').textContent = data.message.split('to ')[1] || '...';
            forms.login.classList.remove('active');
            forms.otp.classList.add('active');
        } else {
            setStatus(status.login, data.error || 'Student not found', 'error');
        }
    } catch (err) {
        setStatus(status.login, 'Network Error', 'error');
    } finally {
        btn.disabled = false;
    }
});

forms.otp.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = inputs.otp.value.trim();
    if (!otp) return;

    setStatus(status.otp, 'Verifying...', 'neutral');

    try {
        const res = await fetch(`${API_BASE}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usn: state.usn, otp })
        });
        const data = await res.json();

        if (data.success) {
            state.token = data.token;
            state.email = data.email;
            state.name = data.name;
            state.photo = data.photo;

            localStorage.setItem('cp_token', state.token);
            localStorage.setItem('cp_usn', state.usn);
            localStorage.setItem('cp_email', state.email);
            if (state.name) localStorage.setItem('cp_name', state.name);
            if (state.photo) localStorage.setItem('cp_photo', state.photo);

            showDashboard();
        } else {
            setStatus(status.otp, data.error, 'error');
        }
    } catch (err) {
        setStatus(status.otp, 'Verification failed', 'error');
    }
});

document.getElementById('back-to-login').addEventListener('click', () => {
    forms.otp.classList.remove('active');
    forms.login.classList.add('active');
});

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.clear();
    state = { token: null, usn: null, email: null, direction: null, requestId: null };
    location.reload();
});

// Trip Logic
document.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('click', () => {
        state.direction = card.dataset.type;
        showForm();
    });
});

document.getElementById('back-to-selection').addEventListener('click', () => {
    showSelector();
});

forms.trip.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
        direction: state.direction,
        time: inputs.time.value,
        flightCode: inputs.flight.value,
        waitMinutes: inputs.wait.value
    };

    try {
        const res = await fetch(`${API_BASE}/requests`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.success) {
            state.requestId = data.requestId;
            localStorage.setItem('cp_req_id', state.requestId);
            showBoard();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('Failed to creates request');
    }
});

document.getElementById('cancel-request-btn').addEventListener('click', async () => {
    if (!state.requestId) return;

    const btn = document.getElementById('cancel-request-btn');
    const originalText = btn.textContent;
    btn.textContent = 'Cancelling...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ requestId: state.requestId })
        });

        if (res.ok) {
            state.requestId = null;
            localStorage.removeItem('cp_req_id');
            showSelector();
        } else {
            alert('Failed to cancel request on server');
        }
    } catch (e) {
        alert('Network error during cancellation');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});


// Matching/Board Logic
// Matching/Board Logic
function startDashboardServices() {
    // Poll matches if we have a request
    if (state.requestId) fetchMatches();
    // Always poll public board
    fetchPublicRequests();

    // Clear existing interval if any (to avoid duplicates on re-login)
    if (window.dashboardInterval) clearInterval(window.dashboardInterval);

    window.dashboardInterval = setInterval(() => {
        if (state.requestId) fetchMatches();
        fetchPublicRequests();
    }, 5000);
}

async function fetchPublicRequests() {
    try {
        const res = await fetch(`${API_BASE}/public-requests`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });
        if (res.ok) {
            const data = await res.json();

            if (data.locked) {
                // Stale or missing request on server
                if (state.requestId) {
                    state.requestId = null;
                    localStorage.removeItem('cp_req_id');
                    showSelector();
                }
            }

            const reqs = data.requests || [];
            renderPublicBoard(reqs);

            if (state.requestId) {
                const myReq = reqs.find(r => r.id === state.requestId);
                if (myReq) renderMyRequest(myReq);
            }
        }
    } catch (e) {
        console.error('Public board error', e);
    }
}

function renderMyRequest(r) {
    const card = document.getElementById('my-request-card');
    if (!card) return;

    const date = new Date(r.time);
    const timeOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true };
    const dateOptions = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' };

    const timeStr = date.toLocaleTimeString('en-IN', timeOptions);
    const dateStr = date.toLocaleDateString('en-IN', dateOptions);

    const isAirport = r.direction === 'airport';
    const icon = isAirport ? '✈️' : '🏠';
    const label = isAirport ? 'Heading to Airport' : 'Coming to Hostel';

    card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <div style="font-size: 0.75rem; color: var(--primary-light); font-weight: 800; text-transform: uppercase; margin-bottom: 4px; letter-spacing: 1px;">
                    ${icon} ${label}
                </div>
                <div style="font-size: 1.75rem; font-weight: 800; color: white; line-height: 1.2;">
                    ${timeStr}
                </div>
                <div style="font-size: 0.9rem; opacity: 0.7; font-weight: 500;">
                    ${dateStr} ${r.flightCode ? '• ' + r.flightCode : ''}
                </div>
            </div>
            <div style="text-align: right;">
                <div class="badge-live">Live</div>
            </div>
        </div>
    `;
}

function renderPublicBoard(requests) {
    const list = document.getElementById('public-board-list');
    const countEl = document.getElementById('public-count');
    if (!list) return;

    if (countEl) countEl.textContent = requests.length;

    // Gatekeeping check - double safety
    if (!state.requestId) {
        list.innerHTML = `
            <div class="empty-state" style="padding:40px 20px;">
                <div style="font-size:32px; margin-bottom:10px;">🔒</div>
                <div style="font-weight:600; color:white;">Board Locked</div>
                <div style="font-size:0.85rem; opacity:0.7; margin-top:5px;">
                    Submit your journey details above to see who's traveling!
                </div>
            </div>
        `;
        return;
    }

    list.innerHTML = '';

    if (requests.length === 0) {
        list.innerHTML = `<div class="empty-state" style="color:#aaa; text-align:center; padding:15px;">No active travelers right now. Be the first!</div>`;
        return;
    }

    requests.sort((a, b) => new Date(a.time) - new Date(b.time));

    const timeOptions = { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true };
    const dateOptions = { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' };

    requests.forEach(r => {
        const date = new Date(r.time);
        const timeStr = date.toLocaleTimeString('en-IN', timeOptions);
        const dateStr = date.toLocaleDateString('en-IN', dateOptions);

        const isAirport = r.direction === 'airport';
        const icon = isAirport ? '✈️' : '🏠';
        const directionLabel = isAirport ? 'To Airport' : 'To Hostel';

        const card = document.createElement('div');
        card.className = 'match-item'; // Reuse styling
        card.style.background = 'rgba(255, 255, 255, 0.03)';

        card.innerHTML = `
            <div class="match-header" style="align-items: center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${r.photo || ''}" onerror="this.style.display='none'" style="width:32px; height:32px; border-radius:50%; object-fit:cover;">
                    <div>
                        <div style="font-weight:bold; color:white; font-size:0.95rem;">${r.name}</div>
                        <div class="match-flight" style="font-size:0.8rem; opacity:0.8;">${icon} ${directionLabel}${r.flightCode ? ' • ' + r.flightCode : ''}</div>
                    </div>
                </div>
                <div class="match-time" style="text-align:right;">
                    <div style="font-weight:600; color:var(--primary-light);">${timeStr}</div>
                    <div style="font-size:0.75rem; opacity:0.6;">${dateStr}</div>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

async function fetchMatches() {
    if (!state.requestId) return;
    try {
        const res = await fetch(`${API_BASE}/matches`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (res.status === 401) {
            localStorage.clear();
            location.reload();
            return;
        }

        const data = await res.json();
        renderMatches(data.matches);
    } catch (err) {
        console.error('Polling error', err);
    }
}

function renderMatches(matches) {
    const list = document.getElementById('matches-list');
    list.innerHTML = '';

    if (matches.length === 0) {
        const inputVal = inputs.time.value;
        let displayTime = 'your time';
        if (inputVal) {
            const date = new Date(inputVal + '+05:30');
            displayTime = date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
        }
        list.innerHTML = `<div class="empty-state" style="color:#888; text-align:center; padding:20px;">No exact matches yet.<br>We'll notify you when someone lands near ${displayTime}.</div>`;
        return;
    }

    matches.forEach(m => {
        const date = new Date(m.time);
        const timeStr = date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });

        const el = document.createElement('div');
        el.className = 'match-item';
        el.style.borderLeft = '4px solid var(--neon-blue)';
        el.innerHTML = `
            <div class="match-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <div style="font-weight:bold; color:white; font-size:1.1rem;">${m.name}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted); text-transform:uppercase; font-weight:700; margin-top:2px;">
                        ${m.direction} • ${m.window}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="color: var(--primary-light); font-weight: 800; font-size: 1.25rem;">${timeStr}</div>
                    <div style="font-size: 0.75rem; opacity:0.6;">${m.wait}</div>
                </div>
            </div>
            <div class="match-actions" style="margin-top:12px;">
                <button class="btn-small btn-neon" onclick="acceptMatch('${m.id}')">
                    <span>Connect Request</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>
        `;
        list.appendChild(el);
    });
}

window.acceptMatch = async (matchId) => {
    const btn = event.target;
    btn.textContent = 'Sending...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ matchId })
        });
        const data = await res.json();
        if (data.success) {
            btn.textContent = 'Email Sent!';
            btn.style.background = '#00ff88';
            btn.style.color = '#000';
        } else {
            btn.textContent = 'Failed';
            btn.disabled = false;
        }
    } catch (e) {
        btn.textContent = 'Error';
    }
};

// Utilities
function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `status-msg ${type}`;
}

// Start
init();
