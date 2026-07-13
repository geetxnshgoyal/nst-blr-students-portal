
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
const bloodGroupStats = document.getElementById('blood-group-stats');

let allStudents = [];

function getMobileNumber(student) {
    return student?.mobile_number || student?.mobile || student?.phone || student?.phone_number || student?.phoneNumber || '';
}

function normalizeBloodGroup(value) {
    if (!value) return '';

    const trimmed = String(value).trim();
    if (!trimmed) return '';

    const compact = trimmed
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/POSITIVE/g, '+')
        .replace(/NEGATIVE/g, '-');

    const aliases = {
        'OPOS': 'O+',
        'OPOSITIVE': 'O+',
        'O+VE': 'O+',
        'ONEG': 'O-',
        'ONEGATIVE': 'O-',
        'O-VE': 'O-',
        'APOS': 'A+',
        'APOSITIVE': 'A+',
        'A+VE': 'A+',
        'ANEG': 'A-',
        'ANEGATIVE': 'A-',
        'A-VE': 'A-',
        'BPOS': 'B+',
        'BPOSITIVE': 'B+',
        'B+VE': 'B+',
        'BNEG': 'B-',
        'BNEGATIVE': 'B-',
        'B-VE': 'B-',
        'ABPOS': 'AB+',
        'ABPOSITIVE': 'AB+',
        'AB+VE': 'AB+',
        'ABNEG': 'AB-',
        'ABNEGATIVE': 'AB-',
        'AB-VE': 'AB-'
    };

    if (aliases[compact]) return aliases[compact];

    const match = compact.match(/^(AB|A|B|O)([+-])$/);
    if (match) return `${match[1]}${match[2]}`;

    return trimmed.toUpperCase();
}

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
    const countChip = document.getElementById('student-count');
    if (countChip) {
        countChip.textContent = `${students.length} shown`;
        countChip.classList.remove('hidden');
    }

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
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                        ${getMobileNumber(s) || 'No Mobile'}
                    </div>
                </div>
            </div>
        `).join('');
}

// ===== Stats Logic =====

function calculateStats() {
    const activeStudents = allStudents.filter(s => s.status !== 'left');
    const total = activeStudents.length;
    // Count MISSING data (as requested "left with each data")
    const missingPhoto = activeStudents.filter(s => !s.photo).length;
    const missingDob = activeStudents.filter(s => !s.birthday).length;
    const missingGithub = activeStudents.filter(s => !s.github).length;
    const missingLinkedin = activeStudents.filter(s => !s.linkedin).length;
    const bloodGroupOrder = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];
    const bloodGroupCounts = {
        'O+': 0, 'O-': 0, 'A+': 0, 'A-': 0,
        'B+': 0, 'B-': 0, 'AB+': 0, 'AB-': 0,
        'Not Set': 0
    };
    activeStudents.forEach(student => {
        const bloodGroup = normalizeBloodGroup(student.blood_group || student.bloodGroup);
        const key = bloodGroup || 'Not Set';
        bloodGroupCounts[key] = (bloodGroupCounts[key] || 0) + 1;
    });

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

    if (!bloodGroupStats) return;

    const orderedBloodGroups = Object.entries(bloodGroupCounts).sort(([groupA], [groupB]) => {
        const indexA = bloodGroupOrder.indexOf(groupA);
        const indexB = bloodGroupOrder.indexOf(groupB);

        if (indexA !== -1 || indexB !== -1) {
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        }

        if (groupA === 'Not Set') return 1;
        if (groupB === 'Not Set') return -1;
        return groupA.localeCompare(groupB);
    });

    bloodGroupStats.innerHTML = `
        <h3>Blood Group Stats</h3>
        <p>Count of students by blood group.</p>
        <div class="blood-group-list">
            ${orderedBloodGroups.map(([group, count]) => `
                <div class="blood-group-pill">
                    <span class="blood-group-pill-value">${count}</span>
                    <span class="blood-group-pill-label">${group}</span>
                </div>
            `).join('')}
        </div>
    `;
    bloodGroupStats.classList.remove('hidden');

    // Make blood-group pills clickable to show students for that group
    // Use a timeout to ensure DOM is updated before attaching listeners
    setTimeout(() => {
        const pills = bloodGroupStats.querySelectorAll('.blood-group-pill');
        pills.forEach(pill => {
            pill.style.cursor = 'pointer';
            pill.addEventListener('click', () => {
                const group = pill.querySelector('.blood-group-pill-label')?.textContent?.trim();
                const studentsForGroup = allStudents.filter(s => {
                    if (s.status === 'left') return false;
                    const bg = normalizeBloodGroup(s.blood_group || s.bloodGroup);
                    if (!bg) return group === 'Not Set';
                    return bg === group;
                });

                if (!studentModal || !modalBody) return;

                if (studentsForGroup.length === 0) {
                    modalBody.innerHTML = `<div style="padding:16px;">No students found for ${group}</div>`;
                } else {
                    modalBody.innerHTML = `
                        <div style="padding:12px 16px;">
                            <h3 style="margin:0 0 8px;">${group} (${studentsForGroup.length})</h3>
                            <ul style="list-style:none; padding:0; margin:0;">
                                ${studentsForGroup.map(s => `
                                    <li style="margin:8px 0;">
                                        <a href="#" data-usn="${s.usn || ''}" class="bg-student-link" style="color:var(--primary-600); text-decoration:none; font-weight:600;">${s.name || s.usn || 'Unknown'}</a>
                                        <div style="font-size:0.85rem; color:var(--text-secondary);">${s.usn || ''}</div>
                                    </li>
                                `).join('')}
                            </ul>
                        </div>
                    `;

                    // Attach click handlers to open individual student modal
                    modalBody.querySelectorAll('.bg-student-link').forEach(link => {
                        link.addEventListener('click', (e) => {
                            e.preventDefault();
                            const usn = link.getAttribute('data-usn');
                            if (!usn) return;
                            openStudentModal(usn);
                        });
                    });
                }

                studentModal.classList.remove('hidden');
            });
        });
    }, 0);
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
                <div class="modal-detail-row"><span class="modal-label">Mobile</span> <span class="modal-value">${getMobileNumber(s) || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Institutional Email</span> <span class="modal-value">${s.institutional_email || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Gender</span> <span class="modal-value">${s.gender || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Birthday</span> <span class="modal-value">${s.birthday || '-'}</span></div>
                <div class="modal-detail-row"><span class="modal-label">Blood Group</span> <span class="modal-value" style="font-weight:600; color:var(--primary-600);">${s.blood_group || s.bloodGroup || '-'}</span></div>
                
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
