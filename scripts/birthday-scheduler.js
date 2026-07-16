const admin = require('firebase-admin');

function getTodayDDMM(date = new Date()) {
    const kolkataTime = date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(kolkataTime);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}`;
}

function getTodayDateString(date = new Date()) {
    const kolkataTime = date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const d = new Date(kolkataTime);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

async function sendBirthdayWishEmail(mailer, student) {
    const email = (student.institutional_email && student.institutional_email.trim() !== '')
        ? student.institutional_email.trim()
        : (student.email ? student.email.trim() : null);
    if (!email) return;

    let hasPhoto = false;
    let photoCid = '';
    const attachments = [];

    // Parse base64 photo and add as inline CID attachment for maximum compatibility
    if (student.photo && student.photo.startsWith('data:image')) {
        try {
            hasPhoto = true;
            photoCid = `birthday_profile_${student.usn}`;
            const base64Data = student.photo.split(';base64,').pop();
            attachments.push({
                filename: 'profile.jpg',
                content: Buffer.from(base64Data, 'base64'),
                cid: photoCid
            });
        } catch (e) {
            console.error('Failed to parse student photo for email attachment:', e);
            hasPhoto = false;
        }
    }

    const photoHtml = hasPhoto
        ? `<img src="cid:${photoCid}" alt="${student.name}" style="width: 110px; height: 110px; border-radius: 50%; border: 3px solid #ffffff; object-fit: cover; display: block; margin: 0 auto 15px auto; box-shadow: 0 6px 18px rgba(0,0,0,0.3);">`
        : `<div style="width: 110px; height: 110px; border-radius: 50%; background-color: rgba(255,255,255,0.2); border: 3px solid #ffffff; display: block; margin: 0 auto 15px auto; text-align: center; line-height: 110px; font-size: 44px; font-weight: 700; color: #ffffff; box-shadow: 0 6px 18px rgba(0,0,0,0.3);">${student.name ? student.name.charAt(0).toUpperCase() : '?'}</div>`;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Happy Birthday!</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #ffffff;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #16171f; border: 1px solid #2a2b36; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <!-- Header Gradient Banner -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); padding: 45px 40px 35px 40px; text-align: center;">
                            ${photoHtml}
                            <h1 style="margin: 10px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Happy Birthday, ${student.name}!</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px; text-align: center;">
                            <p style="font-size: 17px; line-height: 1.7; color: #e2e8f0; margin: 0 0 20px 0; font-weight: 500;">
                                Wishing you a spectacular birthday filled with happiness, learning, and exciting new creations!
                            </p>
                            <p style="font-size: 15px; line-height: 1.7; color: #94a3b8; margin: 0;">
                                As a valued builder in our student community, we hope you take a moment to celebrate your amazing journey today. Keep coding, keep building, and continue to shine!
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f1016; padding: 20px; border-top: 1px solid #2a2b36; text-align: center;">
                            <p style="font-size: 12px; color: #64748b; margin: 0;">
                                Sent with ❤️ from the NST Bangalore Student Committee
                             </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `🎂 Happy Birthday, ${student.name}! ✨`,
        html,
        attachments
    });
    console.log(`📩 Birthday wish email successfully sent to ${student.name} (${email})`);
}

async function sendClassmateBirthdayReminder(mailer, birthdayStudents, allStudents) {
    const birthdayUsns = new Set(birthdayStudents.map(s => s.usn));
    const recipients = [];
    allStudents.forEach(s => {
        if (birthdayUsns.has(s.usn)) return;
        const email = (s.institutional_email && s.institutional_email.trim() !== '')
            ? s.institutional_email.trim()
            : (s.email ? s.email.trim() : null);
        if (email) {
            recipients.push(email);
        }
    });

    if (recipients.length === 0) {
        console.log('⚠️ Classmate reminder: No recipients found to email.');
        return;
    }

    // Build Circular Photos & Names HTML for the Banner
    let photosHtml = '';
    const attachments = [];

    birthdayStudents.forEach((student, index) => {
        let hasPhoto = false;
        let photoCid = '';
        if (student.photo && student.photo.startsWith('data:image')) {
            try {
                hasPhoto = true;
                photoCid = `reminder_profile_${student.usn}_${index}`;
                const base64Data = student.photo.split(';base64,').pop();
                attachments.push({
                    filename: `profile_${index}.jpg`,
                    content: Buffer.from(base64Data, 'base64'),
                    cid: photoCid
                });
            } catch (e) {
                hasPhoto = false;
            }
        }

        const imgHtml = hasPhoto
            ? `<img src="cid:${photoCid}" alt="${student.name}" style="width: 85px; height: 85px; border-radius: 50%; border: 2.5px solid #ffffff; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block; margin: 0 auto;">`
            : `<div style="width: 85px; height: 85px; border-radius: 50%; background-color: rgba(255,255,255,0.2); border: 2.5px solid #ffffff; text-align: center; line-height: 85px; font-size: 34px; font-weight: 700; color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block; margin: 0 auto;">${student.name ? student.name.charAt(0).toUpperCase() : '?'}</div>`;

        photosHtml += `
            <div style="display: inline-block; text-align: center; margin: 10px 15px; vertical-align: top;">
                ${imgHtml}
                <div style="color: #ffffff; font-size: 14px; font-weight: 600; margin-top: 8px; text-shadow: 0 1px 4px rgba(0,0,0,0.4);">${student.name}</div>
            </div>
        `;
    });

    // Formulate clean inline list names string for the email subject and copy
    let namesStr = '';
    if (birthdayStudents.length === 1) {
        namesStr = birthdayStudents[0].name;
    } else if (birthdayStudents.length === 2) {
        namesStr = `${birthdayStudents[0].name} and ${birthdayStudents[1].name}`;
    } else {
        const names = birthdayStudents.map(s => s.name);
        namesStr = `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
    }

    const isPlural = birthdayStudents.length > 1;

    // Generate large body button if it is a single birthday
    let mainWhatsappButtonHtml = '';
    if (!isPlural) {
        const student = birthdayStudents[0];
        const rawMobile = student.mobile_number;
        if (rawMobile) {
            let cleaned = String(rawMobile).replace(/\D/g, '');
            if (cleaned.length === 10) {
                cleaned = '91' + cleaned;
            }
            if (cleaned) {
                const text = encodeURIComponent("Happy Birthday, " + student.name + "!");
                const waLink = `https://wa.me/${cleaned}?text=${text}`;
                mainWhatsappButtonHtml = `
                    <div style="margin-top: 30px;">
                        <a href="${waLink}" style="display: inline-block; background-color: #25d366; color: #ffffff; padding: 14px 35px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 16px; box-shadow: 0 4px 15px rgba(37,211,102,0.3); border: none;">
                            Wish Them 💬
                        </a>
                    </div>
                `;
            }
        }
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Special Day Reminder!</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #ffffff;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #16171f; border: 1px solid #2a2b36; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <!-- Header Gradient Banner with Photos -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 40px 30px 30px 30px; text-align: center;">
                            <div style="margin-bottom: 15px; text-align: center;">
                                ${photosHtml}
                            </div>
                            <h1 style="margin: 5px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Today is a Special Day!</h1>
                        </td>
                    </tr>
                    <!-- Body -->
                    <tr>
                        <td style="padding: 40px; text-align: center;">
                            <p style="font-size: 17px; line-height: 1.7; color: #e2e8f0; margin: 0 0 20px 0; font-weight: 500;">
                                It's time to celebrate connection and community in our class!
                            </p>
                            <p style="font-size: 15px; line-height: 1.7; color: #94a3b8; margin: 0 0 25px 0;">
                                Our classmate${isPlural ? 's' : ''} <strong style="color: #ffffff; font-weight: 600;">${namesStr}</strong> ${isPlural ? 'are' : 'is'} celebrating their birthday${isPlural ? 's' : ''} today! 🎂
                            </p>
                            <p style="font-size: 15px; line-height: 1.7; color: #94a3b8; margin: 0;">
                                Take a moment to reach out, say happy birthday, and make their special day even happier. A simple wish can make a big difference!
                            </p>
                            ${mainWhatsappButtonHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #0f1016; padding: 20px; border-top: 1px solid #2a2b36; text-align: center;">
                            <p style="font-size: 12px; color: #64748b; margin: 0;">
                                Sent with ❤️ from the NST Bangalore Student Committee
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.SMTP_FROM || process.env.SMTP_USER,
        bcc: recipients,
        subject: `🎉 Today is ${namesStr}'s Special Day! 🎂`,
        html,
        attachments
    });
    console.log(`📩 Birthday reminder for ${namesStr} successfully sent to ${recipients.length} classmates in Bcc.`);
}

async function checkBirthdaysAndSendEmails(firestore, mailer, isStartup = false) {
    if (!firestore || !mailer) {
        console.warn('⚠️ Scheduler: Firestore or Mailer offline. Skipping check.');
        return;
    }

    try {
        const todayStr = getTodayDateString();
        console.log(`🎂 Birthday check triggered: ${todayStr} (Startup: ${isStartup})`);

        const runRef = firestore.collection('birthday_runs').doc('last_run');
        const runDoc = await runRef.get();
        if (runDoc.exists && runDoc.data().date === todayStr) {
            console.log(`🎂 Birthday emails already sent for today (${todayStr}). Skipping.`);
            return;
        }

        const snapshot = await firestore.collection('students').get();
        const students = [];
        snapshot.forEach(doc => {
            const record = doc.data() || {};
            if (!record.usn) record.usn = doc.id;
            students.push(record);
        });

        const todayDDMM = getTodayDDMM();
        const todayBirthdays = [];

        for (const student of students) {
            if (student.status === 'left') continue;
            
            const parts = (student.birthday || '').split('-');
            if (parts.length >= 2) {
                const bdayDDMM = `${parts[0]}-${parts[1]}`;
                if (bdayDDMM === todayDDMM) {
                    todayBirthdays.push(student);
                }
            }
        }

        if (todayBirthdays.length > 0) {
            console.log(`🎉 Birthdays found for today (${todayDDMM}): ${todayBirthdays.map(s => s.name).join(', ')}`);
            
            for (const birthdayStudent of todayBirthdays) {
                await sendBirthdayWishEmail(mailer, birthdayStudent);
            }

            await sendClassmateBirthdayReminder(mailer, todayBirthdays, students);

            await runRef.set({
                date: todayStr,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                sentToCount: todayBirthdays.length
            });
            console.log(`🎉 Recorded successful run for today: ${todayStr}`);
        } else {
            console.log(`🎂 Checked birthdays. No student birthdays match today (${todayDDMM}).`);
            
            await runRef.set({
                date: todayStr,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                sentToCount: 0
            });
        }
    } catch (err) {
        console.error('❌ Scheduler: Error running birthday checklist:', err);
    }
}

function startBirthdayScheduler(firestore, mailer) {
    if (!firestore || !mailer) {
        console.error('❌ Scheduler: Cannot start birthday scheduler. Firestore or Mailer is missing.');
        return;
    }

    console.log('🎂 Birthday scheduler successfully registered.');

    const getMsUntilMidnight = () => {
        const now = new Date();
        const kolkataTime = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const localNow = new Date(kolkataTime);

        const nextMidnight = new Date(
            localNow.getFullYear(),
            localNow.getMonth(),
            localNow.getDate() + 1,
            0, 0, 0, 0
        );

        const diffMs = nextMidnight.getTime() - localNow.getTime();
        return diffMs;
    };

    const scheduleNextRun = () => {
        const delay = getMsUntilMidnight();
        const hours = (delay / 3600000).toFixed(2);
        console.log(`🎂 Birthday scheduler: next check scheduled in ${hours} hours (at midnight Asia/Kolkata)`);

        setTimeout(async () => {
            await checkBirthdaysAndSendEmails(firestore, mailer, false);
            scheduleNextRun();
        }, delay);
    };

    checkBirthdaysAndSendEmails(firestore, mailer, true);
    scheduleNextRun();
}

module.exports = {
    startBirthdayScheduler,
    checkBirthdaysAndSendEmails
};
