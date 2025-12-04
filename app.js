// Password protection
const PASSWORD = "12345678@"; // Change this password
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
        authError.textContent = '❌ Incorrect password';
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
const genderFilter = document.getElementById('gender-filter');
const sortSelect = document.getElementById('sort-select');
const studentCount = document.getElementById('student-count');
const modal = document.getElementById('modal');
const modalPhoto = document.getElementById('modal-photo');
const modalName = document.getElementById('modal-name');
const modalEmail = document.getElementById('modal-email');
const closeBtn = document.querySelector('.close');
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
    studentCount.textContent = `${studentsToShow.length} Students`;

    if (studentsToShow.length === 0) {
        studentGrid.innerHTML = '<p style="text-align: center; color: var(--text-secondary); grid-column: 1/-1;">No students found</p>';
        return;
    }

    studentsToShow.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-card';
        
        const githubBadge = (student.github && student.github.trim() !== '') 
            ? ` <span class="github-badge" title="GitHub: ${student.github}">🔗</span>` 
            : '';
        
        if (student.photo && student.photo.trim() !== '') {
            card.innerHTML = `
                <img src="${student.photo}" alt="${student.name}" onerror="this.outerHTML='<div class=\\'no-photo\\'>${student.name.charAt(0).toUpperCase()}</div>'">
                <div class="name">${student.name}${githubBadge}</div>
                <div class="email">${student.email || 'No email'}</div>
            `;
        } else {
            card.innerHTML = `
                <div class="no-photo">${student.name.charAt(0).toUpperCase()}</div>
                <div class="name">${student.name}${githubBadge}</div>
                <div class="email">${student.email || 'No email'}</div>
            `;
        }

        card.onclick = () => showModal(student);
        studentGrid.appendChild(card);
    });
}

function applyFiltersAndSort() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const genderValue = genderFilter ? genderFilter.value : 'all';
    const sortValue = sortSelect ? sortSelect.value : 'name-asc';

    let filtered = students.filter(student => {
        const name = (student.name || '').toLowerCase();
        const email = (student.email || '').toLowerCase();
        const github = (student.github || '').toLowerCase();
        const linkedin = (student.linkedin || '').toLowerCase();
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm) || github.includes(searchTerm) || linkedin.includes(searchTerm);
        const genderMatch = (genderValue === 'all') || ((student.gender || '').toLowerCase() === genderValue);
        return matchesSearch && genderMatch;
    });

    if (sortValue === 'name-asc') {
        filtered.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortValue === 'name-desc') {
        filtered.sort((a,b) => (b.name || '').localeCompare(a.name || ''));
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
    modalName.textContent = student.name;
    modalEmail.textContent = student.email || 'No email provided';
    
    const githubContainer = document.getElementById('modal-github-container');
    const githubLink = document.getElementById('modal-github');
    if (student.github && student.github.trim() !== '') {
        const username = student.github.replace(/^@/, '');
        githubLink.href = `https://github.com/${username}`;
        githubLink.textContent = `@${username}`;
        githubContainer.style.display = 'flex';
    } else {
        githubContainer.style.display = 'none';
    }
    
    const linkedinContainer = document.getElementById('modal-linkedin-container');
    const linkedinLink = document.getElementById('modal-linkedin');
    if (student.linkedin && student.linkedin.trim() !== '') {
        const linkedinUrl = student.linkedin.trim();
        linkedinLink.href = linkedinUrl;
        linkedinLink.textContent = linkedinUrl.replace(/^https?:\/\/(www\.)?/, '');
        linkedinContainer.style.display = 'flex';
    } else {
        linkedinContainer.style.display = 'none';
    }
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Close modal
function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}

closeBtn.onclick = closeModal;
modalOverlay.onclick = closeModal;

window.onclick = (e) => {
    if (e.target === modal) {
        closeModal();
    }
};

// Escape key to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'block') {
        closeModal();
    }
});

// Search functionality
searchInput.addEventListener('input', () => {
    applyFiltersAndSort();
});

if (genderFilter) {
    genderFilter.addEventListener('change', () => applyFiltersAndSort());
}

if (sortSelect) {
    sortSelect.addEventListener('change', () => applyFiltersAndSort());
}


console.log("Hello, Developer! 👋");