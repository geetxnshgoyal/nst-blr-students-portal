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
    const detailMobile = document.getElementById('detail-mobile');
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
            const res = await fetch('/api/portal/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn })
            });
            const data = await res.json();

            if (data.success) {
                showProfile(usn, data.emailHint);
            } else {
                showSearchError(data.error || 'Student not found');
            }
        } catch (err) {
            showSearchError('Connection error. Please try again.');
        } finally {
            showLoading(false);
        }
    });

    function showProfile(usn, emailHint) {
        searchSection.classList.add('hidden');
        profileSection.classList.remove('hidden');

        profileName.textContent = 'STUDENT_' + usn.slice(-4);
        detailUsn.textContent = usn;
        photoInitial.textContent = usn.slice(-1);

        otpSentMsg.textContent = `Verification code sent to ${emailHint}`;
        otpRequestSection.classList.add('hidden');
        otpVerifySection.classList.remove('hidden');

        verifyCard.classList.remove('hidden');
        updateCard.classList.add('hidden');
    }

    // --- Verification Logic ---
    requestOtpBtn.addEventListener('click', async () => {
        const usn = detailUsn.textContent;
        requestOtpBtn.disabled = true;
        requestOtpBtn.textContent = 'SENDING_CODE...';

        try {
            const res = await fetch('/api/portal/request-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn })
            });
            const data = await res.json();

            if (data.success) {
                otpRequestSection.classList.add('hidden');
                otpVerifySection.classList.remove('hidden');
                otpSentMsg.textContent = `Verification code sent to ${data.emailHint}`;
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
            const res = await fetch('/api/portal/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn, otp })
            });
            const data = await res.json();

            if (data.success) {
                verificationToken = data.token;
                verifyCard.classList.add('hidden');
                updateCard.classList.remove('hidden');

                // Populate profile data with the actual fetch details
                const s = data.student;
                const mobile = s.mobile || s.phone || s.phone_number || s.phoneNumber;
                profileName.textContent = s.name || 'Unknown';
                detailEmail.textContent = s.email || 'Not provided';
                detailMobile.textContent = mobile || 'Not provided';
                detailInstEmail.textContent = s.institutional_email || 'Not provided';
                detailGender.textContent = s.gender || 'Not provided';
                detailBirthday.textContent = s.birthday || 'Not provided';
                profileBatch.textContent = s.batch || 'Unassigned';

                githubInput.value = s.github || '';
                linkedinInput.value = s.linkedin || '';
                emailInput.value = s.email || '';
                birthdayInput.value = s.birthday || '';

                if (s.photo) {
                    profilePhoto.src = s.photo;
                    profilePhoto.classList.remove('hidden');
                    photoPlaceholder.classList.add('hidden');
                }
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
