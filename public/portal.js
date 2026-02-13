document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Search
    const searchSection = document.getElementById('search-section');
    const usnForm = document.getElementById('usn-form');
    const usnInput = document.getElementById('usn-input');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');

    // DOM Elements - Profile
    const profileSection = document.getElementById('profile-section');
    const backBtn = document.getElementById('back-btn');
    const profileName = document.getElementById('profile-name');
    const profileBatch = document.getElementById('profile-batch');
    const profilePhoto = document.getElementById('profile-photo');
    const photoPlaceholder = document.getElementById('photo-placeholder');
    const photoInitial = document.getElementById('photo-initial');

    // Profile Details
    const detailUsn = document.getElementById('detail-usn');
    const detailEmail = document.getElementById('detail-email');
    const detailInstEmail = document.getElementById('detail-inst-email');
    const detailGender = document.getElementById('detail-gender');
    const detailBirthday = document.getElementById('detail-birthday');

    // OTP Verification
    const verifyCard = document.getElementById('verify-card');
    const otpRequestSection = document.getElementById('otp-request-section');
    const requestOtpBtn = document.getElementById('request-otp-btn');
    const otpVerifySection = document.getElementById('otp-verify-section');
    const otpInput = document.getElementById('otp-input');
    const verifyOtpBtn = document.getElementById('verify-otp-btn');
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

    // Global State
    let currentStudent = null;
    let verificationToken = null;

    // --- Search Logic ---
    usnForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usn = usnInput.value.trim();
        if (!/^[0-9]{10}$/.test(usn)) return showSearchError('Invalid USN format');

        showLoading(true);
        hideSearchError();

        try {
            // Since we don't have a public student lookup endpoint, 
            // we'll try to find the student via the carpool OTP request route
            // which seems to validate USNs.
            const res = await fetch('/api/carpool/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn, email: 'lookup@internal' }) // Dummy email for validation
            });
            const data = await res.json();

            // Note: server.js doesn't actually return student data here.
            // This is a limitation of the current API. 
            // For now, we'll assume if success=true, the student exists.
            if (data.success || data.error.includes('Too many attempts')) {
                // In a real scenario, we'd fetch actual student data.
                // Since the API is restricted, we'll show the profile section
                // and guide the user to verify to see/edit data.
                showProfile(usn);
            } else {
                showSearchError(data.error || 'Student not found');
            }
        } catch (err) {
            showSearchError('Connection error. Please try again.');
        } finally {
            showLoading(false);
        }
    });

    function showProfile(usn) {
        searchSection.classList.add('hidden');
        profileSection.classList.remove('hidden');

        // Mocking name/display for now as API doesn't provide it publicly
        profileName.textContent = 'STUDENT_' + usn.slice(-4);
        detailUsn.textContent = usn;
        photoInitial.textContent = usn.slice(-1);

        // Reset flags
        verifyCard.classList.remove('hidden');
        updateCard.classList.add('hidden');
    }

    // --- Verification Logic ---
    requestOtpBtn.addEventListener('click', async () => {
        const usn = detailUsn.textContent;
        // In this flow, we need the actual email. 
        // We'll prompt the user if we don't have it (though index.html doesn't have an email field in search)
        // For now, we'll try to use the carpool route.
        requestOtpBtn.disabled = true;
        requestOtpBtn.textContent = 'SENDING_CODE...';

        try {
            const res = await fetch('/api/carpool/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn, email: 'student@nst.edu' }) // Simplified for demo
            });
            const data = await res.json();

            if (data.success) {
                otpRequestSection.classList.add('hidden');
                otpVerifySection.classList.remove('hidden');
                otpSentMsg.textContent = 'Verification code sent to institutional email.';
            } else {
                showOtpError(data.error || 'Failed to send code');
            }
        } catch (err) {
            showOtpError('Connection error');
        } finally {
            requestOtpBtn.disabled = false;
            requestOtpBtn.textContent = 'Send Verification Code';
        }
    });

    verifyOtpBtn.addEventListener('click', async () => {
        const usn = detailUsn.textContent;
        const otp = otpInput.value.trim();
        if (otp.length !== 6) return;

        verifyOtpBtn.disabled = true;
        verifyOtpBtn.textContent = 'VERIFYING...';

        try {
            const res = await fetch('/api/carpool/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn, otp })
            });
            const data = await res.json();

            if (data.success) {
                verificationToken = data.token;
                verifyCard.classList.add('hidden');
                updateCard.classList.remove('hidden');
                // Fill form (in real app, data would come from the verify response)
            } else {
                showOtpError(data.error || 'Invalid code');
            }
        } catch (err) {
            showOtpError('Connection error');
        } finally {
            verifyOtpBtn.disabled = false;
            verifyOtpBtn.textContent = 'Verify';
        }
    });

    // --- Helper Functions ---
    function showSearchError(msg) {
        errorText.textContent = msg;
        errorMessage.classList.remove('hidden');
    }

    function hideSearchError() {
        errorMessage.classList.add('hidden');
    }

    function showOtpError(msg) {
        otpErrorText.textContent = msg;
        otpError.classList.remove('hidden');
    }

    function showLoading(show) {
        const loader = document.getElementById('loading-overlay');
        if (show) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }

    backBtn.addEventListener('click', () => {
        profileSection.classList.add('hidden');
        searchSection.classList.remove('hidden');
    });
});
