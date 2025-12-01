// Student Directory App - Using Local Photos
let students = [];

const studentGrid = document.getElementById('student-grid');
const searchInput = document.getElementById('search');
const studentCount = document.getElementById('student-count');
const modal = document.getElementById('modal');
const modalPhoto = document.getElementById('modal-photo');
const modalName = document.getElementById('modal-name');
const modalEmail = document.getElementById('modal-email');
const closeBtn = document.querySelector('.close');

// Load students from JSON file
async function loadStudents() {
    try {
        const response = await fetch('students.json');
        students = await response.json();
        displayStudents(students);
    } catch (error) {
        console.error('Error loading students:', error);
        studentGrid.innerHTML = '<p style="color: white; text-align: center;">Error loading student data. Make sure students.json exists.</p>';
    }
}

// Display students in grid
function displayStudents(studentsToShow) {
    studentGrid.innerHTML = '';
    studentCount.textContent = `${studentsToShow.length} students`;

    studentsToShow.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-card';
        
        // Check if photo exists
        if (student.photo && student.photo.trim() !== '') {
            card.innerHTML = `
                <img src="${student.photo}" alt="${student.name}" onerror="this.outerHTML='<div class=\\'no-photo\\'>${student.name.charAt(0).toUpperCase()}</div>'">
                <div class="name">${student.name}</div>
                <div class="email">${student.email || 'No email'}</div>
            `;
        } else {
            card.innerHTML = `
                <div class="no-photo">${student.name.charAt(0).toUpperCase()}</div>
                <div class="name">${student.name}</div>
                <div class="email">${student.email || 'No email'}</div>
            `;
        }

        card.onclick = () => showModal(student);
        studentGrid.appendChild(card);
    });
}

// Show modal with student details
function showModal(student) {
    if (student.photo && student.photo.trim() !== '') {
        modalPhoto.src = student.photo;
        modalPhoto.style.display = 'block';
    } else {
        modalPhoto.style.display = 'none';
    }
    modalName.textContent = student.name;
    modalEmail.textContent = student.email || 'No email provided';
    modal.style.display = 'block';
}

// Close modal
closeBtn.onclick = () => {
    modal.style.display = 'none';
};

window.onclick = (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
};

// Search functionality
searchInput.addEventListener('input', () => {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const filtered = students.filter(student => 
        student.name.toLowerCase().includes(searchTerm) ||
        (student.email && student.email.toLowerCase().includes(searchTerm))
    );
    displayStudents(filtered);
});

// Initial load
loadStudents();
