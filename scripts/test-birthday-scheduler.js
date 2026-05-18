const admin = require('firebase-admin');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Initialize Firebase Admin (exactly as done in server.js)
if (admin.apps.length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId,
                clientEmail,
                privateKey: privateKey.replace(/\\n/g, '\n')
            })
        });
    }
}
const firestore = admin.firestore();

// SMTP Config exactly as done in server.js
const smtpConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    } : null
};

const mailer = smtpConfig.host && smtpConfig.auth ? nodemailer.createTransport(smtpConfig) : null;

async function runTest() {
    console.log("⚡ Starting live test of birthday scheduler...");

    if (!mailer) {
        console.error("❌ Mailer configuration is missing in .env!");
        return;
    }

    // Fetch a student who actually has a photo in the DB
    const snapshot = await firestore.collection('students')
        .orderBy('photo')
        .limit(2)
        .get();
        
    const students = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        data.usn = doc.id;
        if (data.photo && data.photo.startsWith('data:image')) {
            students.push(data);
        }
    });

    // Fallback if the orderBy query has issues or is empty
    if (students.length === 0) {
        const fallbackSnapshot = await firestore.collection('students').limit(5).get();
        fallbackSnapshot.forEach(doc => {
            const data = doc.data();
            data.usn = doc.id;
            if (data.photo && data.photo.startsWith('data:image')) {
                students.push(data);
            }
        });
    }

    if (students.length === 0) {
        console.warn("⚠️ No students with photos found! Fetching standard limit fallback...");
        const rawSnapshot = await firestore.collection('students').limit(1).get();
        rawSnapshot.forEach(doc => {
            const data = doc.data();
            data.usn = doc.id;
            students.push(data);
        });
    }

    const testStudent = students[0];
    const testDestination = "goyalgeetansh@gmail.com";
    console.log(`👤 Using student: ${testStudent.name} (has photo: ${!!testStudent.photo})`);
    console.log(`📮 Sending test emails to: ${testDestination}`);

    // Set up photo CIDs and attachments
    let hasPhoto = false;
    let birthdayPhotoCid = '';
    let reminderPhotoCid = '';
    const attachments = [];

    if (testStudent.photo && testStudent.photo.startsWith('data:image')) {
        try {
            hasPhoto = true;
            birthdayPhotoCid = `birthday_profile_test_${testStudent.usn}`;
            reminderPhotoCid = `reminder_profile_test_${testStudent.usn}`;
            const base64Data = testStudent.photo.split(';base64,').pop();
            
            // Push attachments for both emails
            attachments.push({
                filename: 'profile.jpg',
                content: Buffer.from(base64Data, 'base64'),
                cid: birthdayPhotoCid
            });
            attachments.push({
                filename: 'profile.jpg',
                content: Buffer.from(base64Data, 'base64'),
                cid: reminderPhotoCid
            });
        } catch (e) {
            console.error('Failed to parse photo data:', e);
            hasPhoto = false;
        }
    }

    // Generate WhatsApp links for testing
    let testWhatsappLink = '';
    const rawMobile = testStudent.mobile_number || testStudent.mobile || testStudent.phone || testStudent.phone_number || testStudent.phoneNumber;
    if (rawMobile) {
        let cleaned = String(rawMobile).replace(/\D/g, '');
        if (cleaned.length === 10) {
            cleaned = '91' + cleaned;
        }
        if (cleaned) {
            const text = encodeURIComponent("Happy Birthday, " + testStudent.name + "!");
            testWhatsappLink = `https://wa.me/${cleaned}?text=${text}`;
        }
    }

    const testWhatsappButtonBodyHtml = testWhatsappLink
        ? `<div style="margin-top: 30px;">
            <a href="${testWhatsappLink}" style="display: inline-block; background-color: #25d366; color: #ffffff; padding: 14px 35px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 16px; box-shadow: 0 4px 15px rgba(37,211,102,0.3); border: none;">
                Wish Them 💬
            </a>
           </div>`
        : '';

    const birthdayPhotoHtml = hasPhoto
        ? `<img src="cid:${birthdayPhotoCid}" alt="${testStudent.name}" style="width: 110px; height: 110px; border-radius: 50%; border: 3px solid #ffffff; object-fit: cover; display: block; margin: 0 auto 15px auto; box-shadow: 0 6px 18px rgba(0,0,0,0.3);">`
        : `<div style="width: 110px; height: 110px; border-radius: 50%; background-color: rgba(255,255,255,0.2); border: 3px solid #ffffff; display: block; margin: 0 auto 15px auto; text-align: center; line-height: 110px; font-size: 44px; font-weight: 700; color: #ffffff; box-shadow: 0 6px 18px rgba(0,0,0,0.3);">${testStudent.name ? testStudent.name.charAt(0).toUpperCase() : '?'}</div>`;

    const reminderPhotoHtml = hasPhoto
        ? `<div style="display: inline-block; text-align: center; margin: 10px 15px; vertical-align: top;">
            <img src="cid:${reminderPhotoCid}" alt="${testStudent.name}" style="width: 85px; height: 85px; border-radius: 50%; border: 2.5px solid #ffffff; object-fit: cover; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block; margin: 0 auto;">
            <div style="color: #ffffff; font-size: 14px; font-weight: 600; margin-top: 8px; text-shadow: 0 1px 4px rgba(0,0,0,0.4);">${testStudent.name}</div>
           </div>`
        : `<div style="display: inline-block; text-align: center; margin: 10px 15px; vertical-align: top;">
            <div style="width: 85px; height: 85px; border-radius: 50%; background-color: rgba(255,255,255,0.2); border: 2.5px solid #ffffff; text-align: center; line-height: 85px; font-size: 34px; font-weight: 700; color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.3); display: block; margin: 0 auto;">${testStudent.name ? testStudent.name.charAt(0).toUpperCase() : '?'}</div>
            <div style="color: #ffffff; font-size: 14px; font-weight: 600; margin-top: 8px; text-shadow: 0 1px 4px rgba(0,0,0,0.4);">${testStudent.name}</div>
           </div>`;

    // --- HTML Template for Birthday Student ---
    const birthdayHtml = `
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
                            ${birthdayPhotoHtml}
                            <h1 style="margin: 10px 0 0 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Happy Birthday, ${testStudent.name}!</h1>
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

    // --- HTML Template for Classmates Announcement ---
    const reminderHtml = `
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
                                ${reminderPhotoHtml}
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
                                Our classmate <strong style="color: #ffffff; font-weight: 600;">${testStudent.name}</strong> is celebrating their birthday today! 🎂
                            </p>
                            <p style="font-size: 15px; line-height: 1.7; color: #94a3b8; margin: 0;">
                                Take a moment to reach out, say happy birthday, and make their special day even happier. A simple wish can make a big difference!
                            </p>
                            ${testWhatsappButtonBodyHtml}
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

    // 1. Send Birthday Greeting
    console.log("📨 Sending personal greeting test email with inline profile picture...");
    await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: testDestination,
        subject: `🎂 Happy Birthday, ${testStudent.name}! ✨`,
        html: birthdayHtml,
        attachments: attachments.filter(a => a.cid === birthdayPhotoCid)
    });
    console.log("✅ Greeting email sent!");

    // 2. Send Classmate Reminder
    console.log("📨 Sending classmate reminder test email with inline profile picture...");
    await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: testDestination,
        subject: `🎉 Today is ${testStudent.name}'s Special Day! 🎂`,
        html: reminderHtml,
        attachments: attachments.filter(a => a.cid === reminderPhotoCid)
    });
    console.log("✅ Classmate reminder email sent!");

    console.log(`\n🎉 All test emails have been successfully dispatched to ${testDestination}! Please check your inbox.`);
}

runTest().catch(console.error);
