
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const sendOtpBtn = document.getElementById('send-otp-btn');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const backToSend = document.getElementById('back-to-send');
const otpView = document.getElementById('otp-verify-view');
const requestView = document.getElementById('otp-request-view');
const messageBox = document.getElementById('message-box');
const studentsGrid = document.getElementById('students-grid');
const logoutBtn = document.getElementById('logout-btn');

// New Controls
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const birthdaysSection = document.getElementById('birthdays-section');
const birthdaysGrid = document.getElementById('birthdays-grid');
const studentModal = document.getElementById('student-modal');
const modalBody = document.getElementById('modal-body');
const closeModal = document.querySelector('.close-modal');

let allStudents = [];

function showMessage(msg, isError = false) {
    messageBox.querySelector('span').textContent = msg;
    messageBox.classList.remove('hidden');
    messageBox.style.background = isError ? 'var(--error-light)' : 'var(--success-light)';
    messageBox.style.color = isError ? 'var(--error)' : 'var(--success)';
}

function hideMessage() {
    messageBox.classList.add('hidden');
}

// 1. Send OTP
sendOtpBtn.addEventListener('click', async () => {
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = 'Sending...';
    hideMessage();

    try {
        const res = await fetch('/api/admin/login', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            showMessage(data.message);
            requestView.classList.add('hidden');
            otpView.classList.remove('hidden');
        } else {
            showMessage(data.error, true);
        }
    } catch (e) {
        showMessage('Failed to send OTP', true);
    } finally {
        sendOtpBtn.disabled = false;
        sendOtpBtn.textContent = 'Send Verification Code';
    }
});

// 2. Verify OTP
verifyOtpBtn.addEventListener('click', async () => {
    const otp = document.getElementById('admin-otp').value;
    if (!otp || otp.length !== 6) return showMessage('Enter 6-digit code', true);

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = 'Verifying...';
    hideMessage();

    try {
        const res = await fetch('/api/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp })
        });
        const data = await res.json();

        if (data.success) {
            localStorage.setItem('adminToken', data.token);
            showDashboard();
        } else {
            showMessage(data.error, true);
        }
    } catch (e) {
        showMessage('Verification failed', true);
    } finally {
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.textContent = 'Verify Access';
    }
});

// 3. Load Dashboard
async function showDashboard() {
    const token = localStorage.getItem('adminToken');
    if (!token) return logout();

    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    try {
        const res = await fetch('/api/admin/students', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401 || res.status === 403) {
            console.error('Auth error:', res.status);
            logout();
            return;
        }

        if (!res.ok) throw new Error('Failed to fetch data');

        const data = await res.json();

        if (data.success) {
            allStudents = data.students || [];
            try {
                applyFilters(); // Initial render
                if (typeof calculateStats === 'function') calculateStats();
                checkBirthdays();
            } catch (renderError) {
                console.error('Rendering error:', renderError);
                showMessage('Error displaying data', true);
            }
        } else {
            console.error('API returned failure:', data);
            logout();
        }
    } catch (e) {
        console.error('Dashboard error:', e);
        // Only logout if it's a critical error related to auth, otherwise just alert
        // But for safety, keep existing behavior for now, just log it.
        // Actually, if fetch fails (network), we shouldn't logout.
        if (e.message.includes('Auth')) {
            logout();
        } else {
            showMessage('Network error: ' + e.message, true);
        }
    }
}

// ===== Filter & Sort Logic =====

function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const sortKey = sortSelect.value; // 'name', 'usn', 'batch'

    // Filter
    let filtered = allStudents.filter(s =>
        (s.name && s.name.toLowerCase().includes(query)) ||
        (s.usn && s.usn.toLowerCase().includes(query))
    );

    // Sort
    filtered.sort((a, b) => {
        const valA = (a[sortKey] || '').toString().toLowerCase();
        const valB = (b[sortKey] || '').toString().toLowerCase();
        return valA.localeCompare(valB);
    });

    renderStudents(filtered);
}


searchInput.addEventListener('input', applyFilters);
sortSelect.addEventListener('change', applyFilters);

// Birthday button - toggle birthday section
document.getElementById('birthday-btn').addEventListener('click', () => {
    birthdaysSection.classList.toggle('hidden');
});

// Refresh button - reload all students
document.getElementById('refresh-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn.textContent = '⏳ Refreshing...';
    btn.disabled = true;

    try {
        await showDashboard();
        btn.textContent = '✅ Refreshed';
        setTimeout(() => {
            btn.textContent = '🔄 Refresh';
            btn.disabled = false;
        }, 1500);
    } catch (e) {
        btn.textContent = '❌ Failed';
        setTimeout(() => {
            btn.textContent = '🔄 Refresh';
            btn.disabled = false;
        }, 1500);
    }
});


studentsGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.student-card');
    if (card) {
        console.log('Clicked student card:', card.dataset.usn);
        if (card.dataset.usn) {
            openStudentModal(card.dataset.usn);
        }
    }
});

birthdaysGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.birthday-card');
    if (card) {
        console.log('Clicked birthday card:', card.dataset.usn);
        if (card.dataset.usn) {
            openStudentModal(card.dataset.usn);
        }
    }
});

function renderStudents(students) {
    if (students.length === 0) {
        studentsGrid.innerHTML = '<p style="text-align:center; width:100%; color: var(--text-secondary);">No students found.</p>';
        return;
    }

    studentsGrid.innerHTML = students.map(s => `
            <div class="student-card" data-usn="${s.usn || ''}" style="cursor: pointer;">
                <img src="${s.photo || 'https://via.placeholder.com/60'}" class="mini-photo" alt="${s.name}">
                <div class="student-info">
                    <h4>
                        ${s.name || 'Unknown Name'} 
                        ${s.status === 'left' ? '<span style="color:var(--error); font-size:0.8em; margin-left:5px;">(Left Batch)</span>' : ''}
                    </h4>
                    <p>${s.usn || 'No USN'}</p>
                    <div style="font-size: 0.8rem; color: var(--primary-500); margin-top: 4px;">
                        ${s.email || 'No Email'}
                    </div>
                </div>
            </div>
        `).join('');
}

// ===== Stats Logic =====

function calculateStats() {
    const total = allStudents.length;
    // Count MISSING data (as requested "left with each data")
    const missingPhoto = allStudents.filter(s => !s.photo).length;
    const missingDob = allStudents.filter(s => !s.birthday).length;
    const missingGithub = allStudents.filter(s => !s.github).length;
    const missingLinkedin = allStudents.filter(s => !s.linkedin).length;

    const statsBar = document.getElementById('stats-bar');
    if (!statsBar) return;

    statsBar.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${total}</div>
            <div class="stat-label">Total Students</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color:var(--error)">${missingPhoto}</div>
            <div class="stat-label">Missing Photo</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color:var(--warning)">${missingDob}</div>
            <div class="stat-label">Missing Birthday</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color:var(--primary-500)">${missingGithub}</div>
            <div class="stat-label">Missing GitHub</div>
        </div>
        <div class="stat-card">
            <div class="stat-value" style="color:var(--accent-500)">${missingLinkedin}</div>
            <div class="stat-label">Missing LinkedIn</div>
        </div>
    `;
    statsBar.classList.remove('hidden');
}

// ===== Birthdays Logic =====

function checkBirthdays() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all students with birthdays and calculate their next occurrence
    const withBirthdays = allStudents
        .filter(s => s.status !== 'left' && s.birthday)
        .map(s => {
            const parts = s.birthday.split('-');
            if (parts.length < 2) return null;

            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]);

            if (isNaN(day) || isNaN(month)) return null;

            // Calculate next birthday occurrence
            let nextBday = new Date(today.getFullYear(), month - 1, day);

            // If birthday already passed this year, use next year
            if (nextBday < today) {
                nextBday.setFullYear(today.getFullYear() + 1);
            }

            // Calculate days until birthday
            const daysUntil = Math.ceil((nextBday - today) / (1000 * 60 * 60 * 24));

            return {
                ...s,
                nextBday,
                daysUntil,
                displayDate: `${day}/${month}`
            };
        })
        .filter(s => s !== null)
        .sort((a, b) => a.nextBday - b.nextBday); // Sort by upcoming date

    if (withBirthdays.length > 0) {
        birthdaysSection.classList.remove('hidden');
        birthdaysGrid.innerHTML = withBirthdays.map(s => `
                <div class="birthday-card" data-usn="${s.usn || ''}" style="cursor: pointer;">
                    <img src="${s.photo || 'https://via.placeholder.com/40'}" style="width:40px; height:40px; border-radius:50%; margin-bottom:5px;">
                    <div style="font-weight:600; font-size:0.9rem;">${s.name}</div>
                    <div style="color:var(--primary-600); font-size:0.8rem;">${s.displayDate}</div>
                    <div style="color:var(--text-secondary); font-size:0.75rem;">${s.daysUntil === 0 ? 'Today!' : s.daysUntil === 1 ? 'Tomorrow' : `in ${s.daysUntil} days`}</div>
                </div>
            `).join('');
    } else {
        birthdaysSection.classList.add('hidden');
    }
}


// ===== Modal Logic =====

function openStudentModal(usn) {
    try {
        console.log('Opening modal for USN:', usn); // Debug log
        // Ensure accurate comparison by converting to strings
        const s = allStudents.find(stu => String(stu.usn) === String(usn));

        if (!s) {
            console.error('Student not found for USN:', usn, 'Available:', allStudents.map(s => s.usn));
            showMessage('Student data not found', true);
            return;
        }

        modalBody.innerHTML = `
                <div class="modal-profile-header">
                    <img src="${s.photo || 'https://via.placeholder.com/100'}" class="modal-photo">
                    <h2 style="margin: 10px 0 5px;">${s.name || 'Unknown'}</h2>
                    <p style="color: var(--primary-600); margin:0;">${s.usn}</p>
                </div>
                
                <div class="modal-detail-row"><span class="modal-label">Batch</span> <span class="modal-value">${s.batch || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Email</span> <span class="modal-value">${s.email || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Institutional Email</span> <span class="modal-value">${s.institutional_email || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Gender</span> <span class="modal-value">${s.gender || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Birthday</span> <span class="modal-value">${s.birthday || '-'}</span></div>
                
                <div class="modal-detail-row">
                    <span class="modal-label">LinkedIn</span> 
                    <span class="modal-value">${s.linkedin ? `<a href="${s.linkedin}" target="_blank" style="color:var(--primary-500)">View Profile</a>` : '-'}</span>
                </div>
                <div class="modal-detail-row" style="border-bottom: none;">
                    <span class="modal-label">GitHub</span> 
                    <span class="modal-value">${s.github ? `<a href="${s.github}" target="_blank" style="color:var(--primary-500)">View Profile</a>` : '-'}</span>
                </div>
            `;

        studentModal.classList.remove('hidden');
    } catch (e) {
        console.error('Error opening modal:', e);
        showMessage('Failed to open profile', true);
    }
};

closeModal.onclick = () => studentModal.classList.add('hidden');
window.onclick = (e) => {
    if (e.target === studentModal) studentModal.classList.add('hidden');
};

function logout() {
    localStorage.removeItem('adminToken');
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
    otpView.classList.add('hidden');
    requestView.classList.remove('hidden');
    document.getElementById('admin-otp').value = '';
}

backToSend.addEventListener('click', () => {
    otpView.classList.add('hidden');
    requestView.classList.remove('hidden');
    hideMessage();
});

logoutBtn.addEventListener('click', logout);

// Check if already logged in
if (localStorage.getItem('adminToken')) {
    showDashboard();
}
