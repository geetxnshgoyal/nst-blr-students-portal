document.addEventListener('DOMContentLoaded', () => {

    // =========================
    // DOM ELEMENTS
    // =========================

    // Search
    const searchSection = document.getElementById('search-section');
    const usnForm = document.getElementById('usn-form');
    const usnInput = document.getElementById('usn-input');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    // Profile
    const profileSection = document.getElementById('profile-section');
    const backBtn = document.getElementById('back-btn');

    const profileName = document.getElementById('profile-name');
    const profileBatch = document.getElementById('profile-batch');

    const profilePhoto = document.getElementById('profile-photo');
    const photoPlaceholder = document.getElementById('photo-placeholder');
    const photoInitial = document.getElementById('photo-initial');

    // Details
    const detailUsn = document.getElementById('detail-usn');
    const detailEmail = document.getElementById('detail-email');
    const detailInstEmail = document.getElementById('detail-inst-email');
    const detailGender = document.getElementById('detail-gender');
    const detailBirthday = document.getElementById('detail-birthday');

    // OTP
    const verifyCard = document.getElementById('verify-card');

    const otpRequestSection = document.getElementById('otp-request-section');
    const requestOtpBtn = document.getElementById('request-otp-btn');

    const otpVerifySection = document.getElementById('otp-verify-section');

    const otpInput = document.getElementById('otp-input');
    const verifyOtpBtn = document.getElementById('verify-otp-btn');

    const resendOtpBtn = document.getElementById('resend-otp-btn');

    const otpSentMsg = document.getElementById('otp-sent-msg');

    const otpError = document.getElementById('otp-error');
    const otpErrorText = document.getElementById('otp-error-text');

    // Update Form
    const updateCard = document.getElementById('update-card');

    const updateForm = document.getElementById('update-form');

    const githubInput = document.getElementById('github-input');
    const linkedinInput = document.getElementById('linkedin-input');
    const emailInput = document.getElementById('email-input');
    const birthdayInput = document.getElementById('birthday-input');

    const successMessage = document.getElementById('success-message');

    // Loading
    const loadingOverlay = document.getElementById('loading-overlay');

    // =========================
    // GLOBAL STATE
    // =========================

    let currentStudent = null;
    let verificationToken = null;

    // =========================
    // SEARCH STUDENT
    // =========================

    usnForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        const usn = usnInput.value.trim();

        hideSearchError();

        if (!/^\d{10}$/.test(usn)) {
            showSearchError('Please enter a valid 10-digit USN');
            return;
        }

        showLoading(true);

        try {

            // ONLY CHECK STUDENT EXISTS
            const response = await fetch('/api/portal/student', {

                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({ usn })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {

                showSearchError(data.error || 'Student not found');

                return;
            }

            currentStudent = {
                usn,
                emailHint: data.emailHint
            };

            showProfile();

        } catch (err) {

            console.error(err);

            showSearchError('Connection error. Please try again.');

        } finally {

            showLoading(false);
        }
    });

    // =========================
    // SHOW PROFILE
    // =========================

    function showProfile() {

        searchSection.classList.add('hidden');

        profileSection.classList.remove('hidden');

        profileName.textContent =
            'STUDENT_' + currentStudent.usn.slice(-4);

        profileBatch.textContent =
            'Verification Required';

        detailUsn.textContent =
            currentStudent.usn;

        detailEmail.textContent =
            'Verify to view';

        detailInstEmail.textContent =
            currentStudent.emailHint || 'Hidden';

        detailGender.textContent =
            'Verify to view';

        detailBirthday.textContent =
            'Verify to view';

        photoInitial.textContent =
            currentStudent.usn.slice(-1);

        verifyCard.classList.remove('hidden');

        updateCard.classList.add('hidden');

        // IMPORTANT:
        // SHOW SEND OTP BUTTON FIRST

        otpRequestSection.classList.remove('hidden');

        otpVerifySection.classList.add('hidden');

        otpInput.value = '';

        hideOtpError();
    }

    // =========================
    // SEND OTP
    // =========================

    requestOtpBtn.addEventListener('click', sendOtp);

    resendOtpBtn.addEventListener('click', sendOtp);

    async function sendOtp() {

        if (!currentStudent) return;

        hideOtpError();

        requestOtpBtn.disabled = true;

        requestOtpBtn.innerHTML =
            '<span>SENDING...</span>';

        try {

            const response = await fetch('/api/portal/request-otp', {

                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    usn: currentStudent.usn
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {

                showOtpError(
                    data.error || 'Failed to send OTP'
                );

                return;
            }

            otpRequestSection.classList.add('hidden');

            otpVerifySection.classList.remove('hidden');

            otpSentMsg.textContent =
                `Verification code sent to ${data.emailHint}`;

            otpInput.value = '';

            otpInput.focus();

        } catch (err) {

            console.error(err);

            showOtpError('Connection error');

        } finally {

            requestOtpBtn.disabled = false;

            requestOtpBtn.innerHTML =
                '<span>Send Verification Code</span>';
        }
    }

    // =========================
    // VERIFY OTP
    // =========================

    verifyOtpBtn.addEventListener('click', verifyOtp);

    async function verifyOtp() {

        if (!currentStudent) return;

        hideOtpError();

        const otp = otpInput.value.trim();

        if (!/^\d{6}$/.test(otp)) {

            showOtpError('Enter valid 6-digit OTP');

            return;
        }

        verifyOtpBtn.disabled = true;

        verifyOtpBtn.innerHTML =
            '<span>VERIFYING...</span>';

        try {

            const response = await fetch('/api/portal/verify-otp', {

                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    usn: currentStudent.usn,
                    otp
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {

                showOtpError(
                    data.error || 'Invalid OTP'
                );

                return;
            }

            verificationToken = data.token;

            populateStudentData(data.student);

            verifyCard.classList.add('hidden');

            updateCard.classList.remove('hidden');

        } catch (err) {

            console.error(err);

            showOtpError('Connection error');

        } finally {

            verifyOtpBtn.disabled = false;

            verifyOtpBtn.innerHTML =
                '<span>Verify</span>';
        }
    }

    // =========================
    // POPULATE PROFILE
    // =========================

    function populateStudentData(student) {

        profileName.textContent =
            student.name || 'Unknown';

        profileBatch.textContent =
            student.batch || 'Unassigned';

        detailUsn.textContent =
            student.usn || 'Not provided';

        detailEmail.textContent =
            student.email || 'Not provided';

        detailInstEmail.textContent =
            student.institutional_email || 'Not provided';

        detailGender.textContent =
            student.gender || 'Not provided';

        detailBirthday.textContent =
            student.birthday || 'Not provided';

        githubInput.value =
            student.github || '';

        linkedinInput.value =
            student.linkedin || '';

        emailInput.value =
            student.email || '';

        birthdayInput.value =
            student.birthday || '';

        if (student.photo && student.photo.trim() !== '') {

            profilePhoto.src = student.photo;

            profilePhoto.classList.remove('hidden');

            photoPlaceholder.classList.add('hidden');

        } else {

            profilePhoto.classList.add('hidden');

            photoPlaceholder.classList.remove('hidden');

            photoInitial.textContent =
                (student.name || '?')
                    .charAt(0)
                    .toUpperCase();
        }
    }

    // =========================
    // UPDATE PROFILE
    // =========================

    updateForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        if (!verificationToken) {

            showOtpError('Verification required');

            return;
        }

        const payload = {

            github: githubInput.value.trim(),

            linkedin: linkedinInput.value.trim(),

            email: emailInput.value.trim(),

            birthday: birthdayInput.value.trim()
        };

        showLoading(true);

        try {

            const response = await fetch('/api/portal/update-profile', {

                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${verificationToken}`
                },

                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {

                showOtpError(
                    data.error || 'Failed to update profile'
                );

                return;
            }

            successMessage.classList.remove('hidden');

            setTimeout(() => {

                successMessage.classList.add('hidden');

            }, 3000);

        } catch (err) {

            console.error(err);

            showOtpError('Connection error');

        } finally {

            showLoading(false);
        }
    });

    // =========================
    // BACK BUTTON
    // =========================

    backBtn.addEventListener('click', () => {

        profileSection.classList.add('hidden');

        searchSection.classList.remove('hidden');

        currentStudent = null;

        verificationToken = null;

        usnInput.value = '';

        otpInput.value = '';

        hideSearchError();

        hideOtpError();
    });

    // =========================
    // HELPERS
    // =========================

    function showSearchError(message) {

        errorText.textContent = message;

        errorMessage.classList.remove('hidden');
    }

    function hideSearchError() {

        errorMessage.classList.add('hidden');
    }

    function showOtpError(message) {

        otpErrorText.textContent = message;

        otpError.classList.remove('hidden');

        setTimeout(() => {

            otpError.classList.add('hidden');

        }, 4000);
    }

    function hideOtpError() {

        otpError.classList.add('hidden');
    }

    function showLoading(show) {

        if (show) {

            loadingOverlay.classList.remove('hidden');

        } else {

            loadingOverlay.classList.add('hidden');
        }
    }

});
