let authToken = null;
let students = [];

function getMobileNumber(student) {
    return student?.mobile_number || student?.mobile || student?.mobileNumber || student?.phone || student?.phone_number || student?.phoneNumber || '';
}

const authScreen = document.getElementById('auth-screen');
const mainContent = document.getElementById('main-content');
const authForm = document.getElementById('auth-form');
const passwordInput = document.getElementById('password-input');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = passwordInput.value;
    passwordInput.value = '';
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (response.ok && data.token) {
            authToken = data.token;
            showMainContent();
        } else {
            authError.textContent = data.error || 'Login failed';
            setTimeout(() => authError.textContent = '', 3000);
        }
    } catch (error) {
        authError.textContent = 'Connection error';
        setTimeout(() => authError.textContent = '', 3000);
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        if (authToken) {
            await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
        }
    } catch (e) { }
    authToken = null;
    students = [];
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) { }
    authScreen.classList.remove('hidden');
    mainContent.classList.add('hidden');
    document.getElementById('student-grid').innerHTML = '';
});

function showMainContent() {
    authScreen.classList.add('hidden');
    mainContent.classList.remove('hidden');
    loadStudents();
}

const studentGrid = document.getElementById('student-grid');
const searchInput = document.getElementById('search');
const searchClear = document.getElementById('search-clear');
const genderFilter = document.getElementById('gender-filter');
const batchFilter = document.getElementById('batch-filter');
const sortSelect = document.getElementById('sort-select');
const studentCount = document.getElementById('student-count');
const modal = document.getElementById('modal');
const modalPhoto = document.getElementById('modal-photo');
const modalName = document.getElementById('modal-name');
const modalEmail = document.getElementById('modal-email');
const modalMobile = document.getElementById('modal-mobile');
const modalInstitutionalEmail = document.getElementById('modal-institutional-email');
const modalUSN = document.getElementById('modal-usn');
const modalGender = document.getElementById('modal-gender');
const modalBirthday = document.getElementById('modal-birthday');
const modalBatchBadge = document.getElementById('modal-batch-badge');
const closeBtn = document.querySelector('.close-btn');
const modalOverlay = document.querySelector('.modal-overlay');

async function loadStudents() {
    if (!authToken) return;
    try {
        const response = await fetch('/api/students', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.status === 401 || response.status === 403) {
            authToken = null;
            students = [];
            authScreen.classList.remove('hidden');
            mainContent.classList.add('hidden');
            return;
        }
        students = await response.json();
        applyFiltersAndSort();
    } catch (error) {
        studentGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1/-1;">Error loading data</p>';
    }
}

function displayStudents(studentsToShow) {
    if (!authToken) return;
    studentGrid.innerHTML = '';
    studentCount.textContent = `${studentsToShow.length} Student${studentsToShow.length !== 1 ? 's' : ''}`;
    if (studentsToShow.length === 0) {
        studentGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1/-1;">No students found</p>';
        return;
    }
    studentsToShow.forEach((student, index) => {
        const card = document.createElement('div');
        card.className = 'student-card';
        card.style.animationDelay = `${index * 0.03}s`;
        const mobile = getMobileNumber(student);
        let badges = '';
        if (student.github && student.github.trim() !== '') badges += ` <span class="social-badge github-badge" title="GitHub">🔗</span>`;
        if (student.linkedin && student.linkedin.trim() !== '') badges += ` <span class="social-badge linkedin-badge" title="LinkedIn">💼</span>`;
        const initial = student.name ? student.name.charAt(0).toUpperCase() : '?';
        if (student.photo && student.photo.trim() !== '') {
            card.innerHTML = `<img src="${student.photo}" alt="${student.name}" onerror="this.outerHTML='<div class=\\'no-photo\\'>${initial}</div>'"><div class="name">${student.name}${badges}</div><div class="email">${student.email || 'No email'}</div><div class="email">${mobile || 'No mobile'}</div>`;
        } else {
            card.innerHTML = `<div class="no-photo">${initial}</div><div class="name">${student.name}${badges}</div><div class="email">${student.email || 'No email'}</div><div class="email">${mobile || 'No mobile'}</div>`;
        }
        card.onclick = () => showModal(student);
        studentGrid.appendChild(card);
    });
}

function applyFiltersAndSort() {
    if (!authToken) return;
    const searchTerm = searchInput.value.toLowerCase().trim();
    const genderValue = genderFilter.value;
    const batchValue = batchFilter.value;
    const sortValue = sortSelect.value;
    searchClear.style.display = searchTerm ? 'block' : 'none';
    let filtered = students.filter(student => {
        const name = (student.name || '').toLowerCase();
        const email = (student.email || '').toLowerCase();
        const institutionalEmail = (student.institutional_email || '').toLowerCase();
        const github = (student.github || '').toLowerCase();
        const linkedin = (student.linkedin || '').toLowerCase();
        const usn = (student.usn || '').toLowerCase();
        const matchesSearch = !searchTerm || name.includes(searchTerm) || email.includes(searchTerm) || institutionalEmail.includes(searchTerm) || github.includes(searchTerm) || linkedin.includes(searchTerm) || usn.includes(searchTerm);
        const genderMatch = (genderValue === 'all') || ((student.gender || '').toLowerCase() === genderValue);
        const batchMatch = (batchValue === 'all') || ((student.batch || '') === batchValue);
        return matchesSearch && genderMatch && batchMatch;
    });
    if (sortValue === 'name-asc') filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortValue === 'name-desc') filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    displayStudents(filtered);
}

function showModal(student) {
    if (!authToken) return;
    if (student.photo && student.photo.trim() !== '') {
        modalPhoto.src = student.photo;
        modalPhoto.style.display = 'block';
        modalPhoto.onerror = () => { modalPhoto.style.display = 'none'; };
    } else {
        modalPhoto.style.display = 'none';
    }
    modalName.textContent = student.name || 'Unknown';
    modalEmail.textContent = student.email || 'Not provided';
    if (modalMobile) modalMobile.textContent = getMobileNumber(student) || 'Not provided';
    modalInstitutionalEmail.textContent = student.institutional_email || 'Not provided';
    modalUSN.textContent = student.usn || 'Not provided';
    modalGender.textContent = (student.gender || 'Not provided').charAt(0).toUpperCase() + (student.gender || 'not provided').slice(1);
    modalBirthday.textContent = student.birthday || 'Not provided';
    modalBatchBadge.textContent = (student.batch && student.batch.trim() !== '') ? student.batch : 'Unassigned';
    const githubContainer = document.getElementById('modal-github-container');
    const githubLink = document.getElementById('modal-github');
    if (student.github && student.github.trim() !== '') {
        githubLink.href = student.github.trim();
        githubContainer.style.display = 'block';
    } else {
        githubContainer.style.display = 'none';
    }
    const linkedinContainer = document.getElementById('modal-linkedin-container');
    const linkedinLink = document.getElementById('modal-linkedin');
    if (student.linkedin && student.linkedin.trim() !== '') {
        linkedinLink.href = student.linkedin.trim();
        linkedinContainer.style.display = 'block';
    } else {
        linkedinContainer.style.display = 'none';
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

closeBtn.onclick = closeModal;
modalOverlay.onclick = closeModal;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('active')) closeModal(); });
searchClear.addEventListener('click', () => { searchInput.value = ''; applyFiltersAndSort(); searchInput.focus(); });
searchInput.addEventListener('input', () => applyFiltersAndSort());
genderFilter.addEventListener('change', () => applyFiltersAndSort());
batchFilter.addEventListener('change', () => applyFiltersAndSort());
sortSelect.addEventListener('change', () => applyFiltersAndSort());

let lastScrollTop = 0;
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    let currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    if (currentScroll > lastScrollTop && currentScroll > 100) navbar.style.transform = 'translateY(-100%)';
    else navbar.style.transform = 'translateY(0)';
    navbar.style.transition = 'transform 0.3s ease';
    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
});

window.addEventListener('beforeunload', () => { authToken = null; students = []; try { localStorage.clear(); sessionStorage.clear(); } catch (e) { } });
