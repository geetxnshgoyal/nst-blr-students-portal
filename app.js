// Password protection
const PASSWORD = "12345678@";
let isAuthenticated = false;

const authScreen = document.getElementById('auth-screen');
const mainContent = document.getElementById('main-content');
const authForm = document.getElementById('auth-form');
const passwordInput = document.getElementById('password-input');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

// Check if already authenticated
if (sessionStorage.getItem('authenticated') === 'true') {
    showMainContent();
}

authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (passwordInput.value === PASSWORD) {
        sessionStorage.setItem('authenticated', 'true');
        showMainContent();
    } else {
        authError.textContent = 'Incorrect password';
        passwordInput.value = '';
        setTimeout(() => authError.textContent = '', 3000);
    }
});

logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('authenticated');
    authScreen.classList.remove('hidden');
    mainContent.classList.add('hidden');
    passwordInput.value = '';
});

function showMainContent() {
    authScreen.classList.add('hidden');
    mainContent.classList.remove('hidden');
    loadStudents();
}

// Student Directory App
let students = [];

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
const modalInstitutionalEmail = document.getElementById('modal-institutional-email');
const modalUSN = document.getElementById('modal-usn');
const modalGender = document.getElementById('modal-gender');
const modalBirthday = document.getElementById('modal-birthday');
const modalBatchBadge = document.getElementById('modal-batch-badge');
const closeBtn = document.querySelector('.close-btn');
const modalOverlay = document.querySelector('.modal-overlay');

// Load students from JSON file
async function loadStudents() {
    try {
        const response = await fetch('students.json');
        students = await response.json();
        applyFiltersAndSort();
    } catch (error) {
        console.error('Error loading students:', error);
        studentGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1/-1;">Error loading student data</p>';
    }
}

// Display students in grid
function displayStudents(studentsToShow) {
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

        let badges = '';
        if (student.github && student.github.trim() !== '') {
            badges += ` <span class="social-badge github-badge" title="GitHub">🔗</span>`;
        }
        if (student.linkedin && student.linkedin.trim() !== '') {
            badges += ` <span class="social-badge linkedin-badge" title="LinkedIn">💼</span>`;
        }

        if (student.photo && student.photo.trim() !== '') {
            card.innerHTML = `
                <img src="${student.photo}" alt="${student.name}" onerror="this.outerHTML='<div class=\\'no-photo\\'>${student.name.charAt(0).toUpperCase()}</div>'">
                <div class="name">${student.name}${badges}</div>
                <div class="email">${student.email || 'No email'}</div>
            `;
        } else {
            card.innerHTML = `
                <div class="no-photo">${student.name.charAt(0).toUpperCase()}</div>
                <div class="name">${student.name}${badges}</div>
                <div class="email">${student.email || 'No email'}</div>
            `;
        }

        card.onclick = () => showModal(student);
        studentGrid.appendChild(card);
    });
}

function applyFiltersAndSort() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const genderValue = genderFilter.value;
    const batchValue = batchFilter.value;
    const sortValue = sortSelect.value;

    // Update clear button visibility
    if (searchTerm) {
        searchClear.style.display = 'block';
    } else {
        searchClear.style.display = 'none';
    }

    let filtered = students.filter(student => {
        const name = (student.name || '').toLowerCase();
        const email = (student.email || '').toLowerCase();
        const institutionalEmail = (student.institutional_email || '').toLowerCase();
        const github = (student.github || '').toLowerCase();
        const linkedin = (student.linkedin || '').toLowerCase();
        const usn = (student.usn || '').toLowerCase();

        const matchesSearch = !searchTerm ||
            name.includes(searchTerm) ||
            email.includes(searchTerm) ||
            institutionalEmail.includes(searchTerm) ||
            github.includes(searchTerm) ||
            linkedin.includes(searchTerm) ||
            usn.includes(searchTerm);

        const genderMatch = (genderValue === 'all') || ((student.gender || '').toLowerCase() === genderValue);
        const batchMatch = (batchValue === 'all') || ((student.batch || '') === batchValue);

        return matchesSearch && genderMatch && batchMatch;
    });

    // Sort
    if (sortValue === 'name-asc') {
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortValue === 'name-desc') {
        filtered.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    }

    displayStudents(filtered);
}

// Show modal with student details
function showModal(student) {
    if (student.photo && student.photo.trim() !== '') {
        modalPhoto.src = student.photo;
        modalPhoto.style.display = 'block';
        modalPhoto.onerror = () => {
            modalPhoto.style.display = 'none';
        };
    } else {
        modalPhoto.style.display = 'none';
    }

    modalName.textContent = student.name || 'Unknown';
    modalEmail.textContent = student.email || 'Not provided';
    modalInstitutionalEmail.textContent = student.institutional_email || 'Not provided';
    modalUSN.textContent = student.usn || 'Not provided';
    modalGender.textContent = (student.gender || 'Not provided').charAt(0).toUpperCase() + (student.gender || 'not provided').slice(1);
    modalBirthday.textContent = student.birthday || 'Not provided';

    if (student.batch && student.batch.trim() !== '') {
        modalBatchBadge.textContent = student.batch;
    } else {
        modalBatchBadge.textContent = 'Unassigned';
    }

    // GitHub
    const githubContainer = document.getElementById('modal-github-container');
    const githubLink = document.getElementById('modal-github');
    if (student.github && student.github.trim() !== '') {
        const githubUrl = student.github.trim();
        githubLink.href = githubUrl;
        githubContainer.style.display = 'block';
    } else {
        githubContainer.style.display = 'none';
    }

    // LinkedIn
    const linkedinContainer = document.getElementById('modal-linkedin-container');
    const linkedinLink = document.getElementById('modal-linkedin');
    if (student.linkedin && student.linkedin.trim() !== '') {
        const linkedinUrl = student.linkedin.trim();
        linkedinLink.href = linkedinUrl;
        linkedinContainer.style.display = 'block';
    } else {
        linkedinContainer.style.display = 'none';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

closeBtn.onclick = closeModal;
modalOverlay.onclick = closeModal;

// Escape key to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
        closeModal();
    }
});

// Search clear button
searchClear.addEventListener('click', () => {
    searchInput.value = '';
    applyFiltersAndSort();
    searchInput.focus();
});

// Event listeners
searchInput.addEventListener('input', () => {
    applyFiltersAndSort();
});

genderFilter.addEventListener('change', () => applyFiltersAndSort());
batchFilter.addEventListener('change', () => applyFiltersAndSort());
sortSelect.addEventListener('change', () => applyFiltersAndSort());

console.log("🎓 Student Directory Loaded! 👋");
