// Student Self-Service Portal
// ALL data fetched from secure server APIs - NO direct Firebase access

// DOM Elements
const searchSection = document.getElementById('search-section');
const profileSection = document.getElementById('profile-section');
const loadingOverlay = document.getElementById('loading-overlay');
const usnForm = document.getElementById('usn-form');
const usnInput = document.getElementById('usn-input');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const backBtn = document.getElementById('back-btn');
const updateForm = document.getElementById('update-form');
const successMessage = document.getElementById('success-message');

// Profile elements
const photoContainer = document.getElementById('photo-container');
const photoPlaceholder = document.getElementById('photo-placeholder');
const photoInitial = document.getElementById('photo-initial');
const profilePhoto = document.getElementById('profile-photo');
const photoInput = document.getElementById('photo-input');
const photoUploadOverlay = document.getElementById('photo-upload-overlay');
const profileName = document.getElementById('profile-name');
const profileBatch = document.getElementById('profile-batch');

// Detail elements
const detailUSN = document.getElementById('detail-usn');
const detailEmail = document.getElementById('detail-email');
const detailInstEmail = document.getElementById('detail-inst-email');
const detailGender = document.getElementById('detail-gender');
const detailBirthday = document.getElementById('detail-birthday');

// Form inputs
const githubInput = document.getElementById('github-input');
const linkedinInput = document.getElementById('linkedin-input');
const emailInput = document.getElementById('email-input');
const birthdayInput = document.getElementById('birthday-input');
const submitBtn = document.getElementById('submit-btn');

// OTP elements
const verifyCard = document.getElementById('verify-card');
const updateCard = document.getElementById('update-card');
const requestOtpBtn = document.getElementById('request-otp-btn');
const otpRequestSection = document.getElementById('otp-request-section');
const otpVerifySection = document.getElementById('otp-verify-section');
const otpSentMsg = document.getElementById('otp-sent-msg');
const otpInput = document.getElementById('otp-input');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const resendOtpBtn = document.getElementById('resend-otp-btn');
const otpError = document.getElementById('otp-error');
const otpErrorText = document.getElementById('otp-error-text');

// Current student data and edit token
let currentStudent = null;
let editToken = null; // Token received after OTP verification

// ===== Utility Functions =====
function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showOtpError(message) {
    otpErrorText.textContent = message;
    otpError.classList.remove('hidden');
    setTimeout(() => {
        otpError.classList.add('hidden');
    }, 5000);
}

function hideOtpError() {
    otpError.classList.add('hidden');
}

function showSuccess() {
    successMessage.classList.remove('hidden');
    setTimeout(() => {
        successMessage.classList.add('hidden');
    }, 3000);
}

function showToast(message, type = 'success') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${type === 'success'
            ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
            : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
        }
        </svg>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function validateUSN(usn) {
    return /^[0-9]{10}$/.test(usn);
}

// ===== OTP Functions =====
async function requestOTP(usn) {
    const response = await fetch(`/api/portal/student/${usn}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
    }

    return data;
}

async function verifyOTP(usn, otp) {
    const response = await fetch(`/api/portal/student/${usn}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
    }

    return data;
}

// ===== API Functions =====
async function fetchStudent(usn) {
    const response = await fetch(`/api/portal/student/${usn}`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch student data');
    }

    return data;
}

async function updateStudent(usn, updates) {
    // Include editToken in updates
    updates.editToken = editToken;

    const response = await fetch(`/api/portal/student/${usn}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
    }

    return data;
}

async function uploadPhoto(usn, file) {
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('editToken', editToken);

    const response = await fetch(`/api/portal/student/${usn}/photo`, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to upload photo');
    }

    return data;
}

// ===== UI Functions =====
function displayStudent(student) {
    currentStudent = student;
    editToken = null; // Reset edit token when viewing new student

    // Set profile header
    profileName.textContent = student.name || 'Unknown';
    profileBatch.textContent = student.batch || 'Unassigned';

    // Set photo
    if (student.photo && student.photo.trim()) {
        profilePhoto.src = student.photo;
        profilePhoto.classList.remove('hidden');
        photoPlaceholder.classList.add('hidden');
    } else {
        profilePhoto.classList.add('hidden');
        photoPlaceholder.classList.remove('hidden');
        photoInitial.textContent = (student.name || 'U').charAt(0).toUpperCase();
    }

    // Set details
    detailUSN.textContent = student.usn || '-';

    setDetailValue(detailEmail, student.email);
    setDetailValue(detailInstEmail, student.institutional_email);
    setDetailValue(detailGender, student.gender ? capitalizeFirst(student.gender) : null);
    setDetailValue(detailBirthday, student.birthday);

    // Set form values and highlight missing fields
    setupFormField('github', githubInput, student.github);
    setupFormField('linkedin', linkedinInput, student.linkedin);
    setupFormField('email', emailInput, student.email);
    setupFormField('birthday', birthdayInput, student.birthday);

    // Reset OTP state - show verify card, hide update card
    resetOTPState();

    // Show profile section
    searchSection.classList.add('hidden');
    profileSection.classList.remove('hidden');
}

function resetOTPState() {
    editToken = null;

    // Show verify card, hide update card
    verifyCard.classList.remove('hidden');
    updateCard.classList.add('hidden');

    // Reset OTP sections
    otpRequestSection.classList.remove('hidden');
    otpVerifySection.classList.add('hidden');
    otpInput.value = '';
    hideOtpError();

    // Reset button states
    requestOtpBtn.disabled = false;
    requestOtpBtn.querySelector('span').textContent = 'Send Verification Code';
}

function showVerified() {
    // Hide verify card, show update card
    verifyCard.classList.add('hidden');
    updateCard.classList.remove('hidden');

    showToast('Identity verified! You can now edit your profile.');
}

function setDetailValue(element, value) {
    if (value && value.trim()) {
        element.textContent = value;
        element.classList.remove('missing');
    } else {
        element.textContent = 'Not provided';
        element.classList.add('missing');
    }
}

function setupFormField(fieldName, inputElement, value) {
    const group = document.getElementById(`${fieldName}-group`);
    const status = document.getElementById(`${fieldName}-status`);

    if (value && value.trim()) {
        inputElement.value = value;
        group.classList.add('filled');
        group.classList.remove('missing');
        status.textContent = '✓ Filled';
        status.classList.add('filled');
        status.classList.remove('missing');
    } else {
        inputElement.value = '';
        group.classList.add('missing');
        group.classList.remove('filled');
        status.textContent = '⚠ Missing';
        status.classList.add('missing');
        status.classList.remove('filled');
    }
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function resetToSearch() {
    profileSection.classList.add('hidden');
    searchSection.classList.remove('hidden');
    usnInput.value = '';
    currentStudent = null;
    editToken = null;
    hideError();
}

// ===== Event Handlers =====

// USN Search Form
usnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const usn = usnInput.value.trim();

    if (!validateUSN(usn)) {
        showError('Please enter a valid 10-digit USN');
        return;
    }

    showLoading();

    try {
        const student = await fetchStudent(usn);
        displayStudent(student);
    } catch (error) {
        showError(error.message);
    } finally {
        hideLoading();
    }
});

// Back Button
backBtn.addEventListener('click', resetToSearch);

// ===== OTP Event Handlers =====

// Request OTP Button
requestOtpBtn.addEventListener('click', async () => {
    if (!currentStudent) return;

    requestOtpBtn.disabled = true;
    requestOtpBtn.querySelector('span').textContent = 'Sending...';
    hideOtpError();

    try {
        const result = await requestOTP(currentStudent.usn);

        // Show OTP input section
        otpSentMsg.textContent = `Verification code sent to ${result.email}`;
        otpRequestSection.classList.add('hidden');
        otpVerifySection.classList.remove('hidden');
        otpInput.focus();

    } catch (error) {
        showOtpError(error.message);
        requestOtpBtn.disabled = false;
        requestOtpBtn.querySelector('span').textContent = 'Send Verification Code';
    }
});

// Verify OTP Button
verifyOtpBtn.addEventListener('click', async () => {
    if (!currentStudent) return;

    const otp = otpInput.value.trim();

    if (!otp || otp.length !== 6) {
        showOtpError('Please enter a 6-digit code');
        return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.querySelector('span').textContent = 'Verifying...';
    hideOtpError();

    try {
        const result = await verifyOTP(currentStudent.usn, otp);

        // Store edit token
        editToken = result.editToken;

        // Show update form
        showVerified();

    } catch (error) {
        showOtpError(error.message);
        verifyOtpBtn.disabled = false;
        verifyOtpBtn.querySelector('span').textContent = 'Verify';
    }
});

// Resend OTP Button
resendOtpBtn.addEventListener('click', async () => {
    if (!currentStudent) return;

    resendOtpBtn.textContent = 'Sending...';
    resendOtpBtn.disabled = true;
    hideOtpError();

    try {
        const result = await requestOTP(currentStudent.usn);
        otpSentMsg.textContent = `New code sent to ${result.email}`;
        otpInput.value = '';
        otpInput.focus();
        showToast('New verification code sent!');
    } catch (error) {
        showOtpError(error.message);
    } finally {
        resendOtpBtn.textContent = 'Resend code';
        resendOtpBtn.disabled = false;
    }
});

// OTP Input - auto submit on 6 digits
otpInput.addEventListener('input', (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = value;

    if (value.length === 6) {
        verifyOtpBtn.click();
    }
});

// Photo Upload
photoContainer.addEventListener('click', () => {
    if (!editToken) {
        showToast('Please verify your identity first', 'error');
        return;
    }
    photoInput.click();
});

photoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentStudent) return;

    if (!editToken) {
        showToast('Please verify your identity first', 'error');
        return;
    }

    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
        showToast('Photo must be less than 5MB', 'error');
        return;
    }

    showLoading();

    try {
        const result = await uploadPhoto(currentStudent.usn, file);

        // Update UI with new photo
        profilePhoto.src = result.photoUrl;
        profilePhoto.classList.remove('hidden');
        photoPlaceholder.classList.add('hidden');

        // Update current student data
        currentStudent.photo = result.photoUrl;

        showToast('Photo uploaded successfully!');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        hideLoading();
        photoInput.value = '';
    }
});

// Update Form
updateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentStudent) return;

    if (!editToken) {
        showToast('Please verify your identity first', 'error');
        return;
    }

    const updates = {};

    // Collect only changed/filled values
    const github = githubInput.value.trim();
    const linkedin = linkedinInput.value.trim();
    const email = emailInput.value.trim();
    const birthday = birthdayInput.value.trim();

    if (github && github !== currentStudent.github) {
        updates.github = github;
    }
    if (linkedin && linkedin !== currentStudent.linkedin) {
        updates.linkedin = linkedin;
    }
    if (email && email !== currentStudent.email) {
        updates.email = email;
    }
    if (birthday && birthday !== currentStudent.birthday) {
        // Validate birthday format
        if (!/^\d{2}-\d{2}-\d{4}$/.test(birthday)) {
            showToast('Birthday must be in DD-MM-YYYY format', 'error');
            return;
        }
        updates.birthday = birthday;
    }

    if (Object.keys(updates).length === 0) {
        showToast('No changes to save', 'error');
        return;
    }

    // Disable submit button
    submitBtn.disabled = true;
    showLoading();

    try {
        await updateStudent(currentStudent.usn, updates);

        // Update current student data
        Object.assign(currentStudent, updates);

        // Refresh display
        displayStudent(currentStudent);

        showSuccess();
        showToast('Profile updated successfully!');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        hideLoading();
    }
});

// Input validation feedback
githubInput.addEventListener('input', () => {
    const value = githubInput.value.trim();
    const group = document.getElementById('github-group');
    const status = document.getElementById('github-status');

    if (value) {
        try {
            new URL(value);
            group.classList.remove('missing');
            group.classList.add('filled');
            status.textContent = '✓ Valid';
            status.classList.add('filled');
            status.classList.remove('missing');
        } catch {
            status.textContent = '⚠ Invalid URL';
            status.classList.add('missing');
            status.classList.remove('filled');
        }
    }
});

linkedinInput.addEventListener('input', () => {
    const value = linkedinInput.value.trim();
    const group = document.getElementById('linkedin-group');
    const status = document.getElementById('linkedin-status');

    if (value) {
        try {
            new URL(value);
            group.classList.remove('missing');
            group.classList.add('filled');
            status.textContent = '✓ Valid';
            status.classList.add('filled');
            status.classList.remove('missing');
        } catch {
            status.textContent = '⚠ Invalid URL';
            status.classList.add('missing');
            status.classList.remove('filled');
        }
    }
});

emailInput.addEventListener('input', () => {
    const value = emailInput.value.trim();
    const group = document.getElementById('email-group');
    const status = document.getElementById('email-status');

    if (value) {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            group.classList.remove('missing');
            group.classList.add('filled');
            status.textContent = '✓ Valid';
            status.classList.add('filled');
            status.classList.remove('missing');
        } else {
            status.textContent = '⚠ Invalid email';
            status.classList.add('missing');
            status.classList.remove('filled');
        }
    }
});

birthdayInput.addEventListener('input', () => {
    const value = birthdayInput.value.trim();
    const group = document.getElementById('birthday-group');
    const status = document.getElementById('birthday-status');

    if (value) {
        if (/^\d{2}-\d{2}-\d{4}$/.test(value)) {
            group.classList.remove('missing');
            group.classList.add('filled');
            status.textContent = '✓ Valid';
            status.classList.add('filled');
            status.classList.remove('missing');
        } else {
            status.textContent = '⚠ Use DD-MM-YYYY';
            status.classList.add('missing');
            status.classList.remove('filled');
        }
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !profileSection.classList.contains('hidden')) {
        resetToSearch();
    }
});

// Auto-focus USN input
usnInput.focus();
