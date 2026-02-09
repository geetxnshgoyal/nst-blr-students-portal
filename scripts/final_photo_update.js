require('dotenv').config();
const admin = require('firebase-admin');
const axios = require('axios');
const sharp = require('sharp');

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
});

const db = admin.firestore();

// Photos in order with names
const photoMappings = [
    { name: 'Vani Bansal', url: 'https://media.licdn.com/dms/image/v2/D5603AQFonw525PgocA/profile-displayphoto-crop_800_800/B56ZnFV1rXJkAI-/0/1759952462255?e=1772064000&v=beta&t=IKBa3CeG5gOye_hRD-X1sJeeNKGAfTyVZ81g91-Xzdc' },
    { name: 'Utsav Doye', url: 'https://media.licdn.com/dms/image/v2/D5603AQHkY3QqID459w/profile-displayphoto-crop_800_800/B56ZkfXXQsHIAI-/0/1757167842980?e=1772064000&v=beta&t=_Mlz_bBt7wXA8jVTle1PZ8ozKTYT2LKaVNmmQ1tMzpk' },
    { name: 'Sumayya Khan', url: 'https://media.licdn.com/dms/image/v2/D5603AQECOme4Cz6vdg/profile-displayphoto-scale_400_400/B56ZwBj0Q5IQAg-/0/1769552693871?e=1772064000&v=beta&t=sxUsHIPm-ZMX42pXmu-PoxvR52UsQMg8Slbb5EYAk4g' },
    { name: 'Siddhanth Shiraguppi', url: 'https://media.licdn.com/dms/image/v2/D5603AQGGEtw2F6wXfw/profile-displayphoto-scale_400_400/B56Zuf6zMQKsAk-/0/1767914551468?e=1772064000&v=beta&t=LA-7B5vKw1xp5ChYSgOokhvaVkfkzA6yFM_1T1ctGpw' },
    { name: 'Shubhangi Kumari', url: 'https://media.licdn.com/dms/image/v2/D4E03AQHLA80Jhe8n5g/profile-displayphoto-scale_400_400/B4EZgNQhNzHgAk-/0/1752569092877?e=1772064000&v=beta&t=ZnDhBx5_ub2BdkQj_3gT180KoPaL8qCLFjQDFrcCTEY' },
    { name: 'Sadiqua Parween', url: 'https://media.licdn.com/dms/image/v2/D4E03AQE_SdKgeHCBhg/profile-displayphoto-scale_400_400/B4EZjuz6b4GYAg-/0/1756353247851?e=1772064000&v=beta&t=-C7POEnVSDM_Q1G1xcnBHyOOz_B6FpSauQFFixZJqP8' },
    { name: 'Rajveer Singh', url: 'https://media.licdn.com/dms/image/v2/D5603AQHRFBLp2zIVqw/profile-displayphoto-scale_400_400/B56ZwpuHrLHQAg-/0/1770226483962?e=1772064000&v=beta&t=aklGa6gK2fsfYwqs4AdAiByjZdVMLw16VnSQUVlINpc' },
    { name: 'Rachana Adhikary', url: 'https://media.licdn.com/dms/image/v2/D4E03AQHt9CfF_YSAeA/profile-displayphoto-scale_400_400/B4EZllLsuEKcAg-/0/1758339192068?e=1772064000&v=beta&t=CNtDCxy6K-hzmnmVkhduCzSUtDvzu3x41EXNwZ3zY8E' },
    { name: 'Pulkit Namdev', url: 'https://media.licdn.com/dms/image/v2/D4D03AQGGw-Z4m5us_A/profile-displayphoto-scale_400_400/B4DZwxk.6iJwAg-/0/1770358305457?e=1772064000&v=beta&t=v7Bvt2Fxi5ZMD3mmpiIxlJVKUI_vJ7WXq-COv7jqTZ0' },
    { name: 'Prashant C G', url: 'https://media.licdn.com/dms/image/v2/D5603AQFcvgRMBhVf8w/profile-displayphoto-scale_400_400/B56ZowWQBaJoAg-/0/1761747735475?e=1772064000&v=beta&t=byRsrqA-_US9ZmOf4s5K0Rd4w5mrX-CDFEPUftdd62s' },
    { name: 'Pm Mohammed Waaiz', url: 'https://media.licdn.com/dms/image/v2/D4D03AQHvV41EUF9rxA/profile-displayphoto-scale_400_400/B4DZwfSDeRKEAg-/0/1770051357284?e=1772064000&v=beta&t=cGJ3mcJeVidUTd7ww1BttMI9uFBeTDZq5gFLu64vxIQ' },
    { name: 'Pankaj Kumar', url: 'https://media.licdn.com/dms/image/v2/D4D03AQG3b1qdB2C4rA/profile-displayphoto-scale_400_400/B4DZkREH8xH4Ao-/0/1756927918876?e=1772064000&v=beta&t=e9QDEGNplTvXndHieDt7BpuXyJYL3J6D_tXt1809PTk' },
    { name: 'Paheli Choudhuri', url: 'https://media.licdn.com/dms/image/v2/D5603AQFwAlAWNVVzzg/profile-displayphoto-shrink_400_400/B56ZcwTC0RGQAg-/0/1748861990460?e=1772064000&v=beta&t=epK5i7tXu57wTvK74UBMFngf6kjHjTg_c85QEXtuPu4' },
    { name: 'Mohammed Anas', url: 'https://media.licdn.com/dms/image/v2/D5603AQG5HneXmzKonQ/profile-displayphoto-scale_400_400/B56Zv4tnncKkAk-/0/1769404267759?e=1772064000&v=beta&t=VNoGwG57mlFZRvwlA_3ld3cpI-mpyVD5iptHALV1jNU' },
    { name: 'Luvya Padmaj Rana', url: 'https://media.licdn.com/dms/image/v2/D4D03AQGaXUMmhHVatw/profile-displayphoto-scale_400_400/B4DZjGXRqVGgAo-/0/1755674649121?e=1772064000&v=beta&t=iYXCXlO2pSxjmOy4VMXf7Hg_9_TOC8Qjqn5lhsKvzQw' },
    { name: 'Liya M', url: 'https://media.licdn.com/dms/image/v2/D4D03AQEqFiywu6NAsQ/profile-displayphoto-scale_400_400/B4DZhP88dyGkAg-/0/1753688034891?e=1772064000&v=beta&t=C_FhoZJR_mlBcbkl0jwGPe__AIJ-YwZDi2IygXRrRYE' },
    { name: 'Kumari Shristi', url: 'https://media.licdn.com/dms/image/v2/D4D03AQFDW_vCpjvvFg/profile-displayphoto-scale_400_400/B4DZw4t5n8IgAg-/0/1770478083187?e=1772064000&v=beta&t=et11RTqorrB6rL95E4AHk1f7YE-mVk9wewFwHqgnKOY' },
    { name: 'Kartikmanmode', url: 'https://media.licdn.com/dms/image/v2/D5603AQEMvEiv7y8toQ/profile-displayphoto-scale_400_400/B56ZfGIN5NG0As-/0/1751375734136?e=1772064000&v=beta&t=IAiPHURQunsCiKkEfasDhipWsP2nEinAp9q_gIFP3NM' },
    { name: 'Harshit Shukla', url: 'https://media.licdn.com/dms/image/v2/D5603AQHN5zeFC8Zv9Q/profile-displayphoto-shrink_200_200/B56ZuxpMJuIoAc-/0/1768211924407?e=1772064000&v=beta&t=aQ-iGpurPphaICMxrQebkJ-DgT4AAashY2bAAT1Nb4s' },
    { name: 'Asmitha. M', url: 'https://media.licdn.com/dms/image/v2/D5603AQGG1oJkeG6POQ/profile-displayphoto-scale_400_400/B56ZuRnTTvHYAg-/0/1767674558875?e=1772064000&v=beta&t=AZlZ0VTNrhoOGt83kj-l3_laW8b83FymVneXqteIo3A' },
    { name: 'Ashmita Kamath', url: 'https://media.licdn.com/dms/image/v2/D5603AQH_uJMbtQZlGg/profile-displayphoto-scale_400_400/B56Zw9l5OFHYAg-/0/1770559875028?e=1772064000&v=beta&t=XxWUyOyOh1DoDTysLbgZ3WBGzoJ17CQgYnw35BD8unI' },
    { name: 'ARUNIKA CHANDA', url: 'https://media.licdn.com/dms/image/v2/D4E03AQFmBpS0z4YTIw/profile-displayphoto-crop_800_800/B4EZd9ITVdHcAQ-/0/1750151030302?e=1772064000&v=beta&t=6dBsH1byfAtOz-32LHMzz7y67E_6nii4v6qfvQwUvwo' },
    { name: 'Anushka Gupta', url: 'https://media.licdn.com/dms/image/v2/D4D03AQHQWHnV4_QhIg/profile-displayphoto-scale_400_400/B4DZqGKvkCJcAg-/0/1763187556167?e=1772064000&v=beta&t=34sn8dUWhZBranjmyDJKW267FRsrNtqMFu3M_qKeoNU' },
    { name: 'Aarpan Lohora', url: 'https://media.licdn.com/dms/image/v2/D4E03AQEwGjU-UxGWYA/profile-displayphoto-scale_400_400/B4EZiAgqHDHEAg-/0/1754502709663?e=1772064000&v=beta&t=BVxL9VyFgSQaaYaGnrPUZPaOOrKlLRBNydCkSXdCv_8' }
];

async function updatePhotosHighQuality() {
    console.log('🔄 Starting high-quality photo updates...\n');

    // Fetch all students
    const snapshot = await db.collection('students').get();
    const students = [];
    snapshot.forEach(doc => {
        students.push({ usn: doc.id, ...doc.data() });
    });

    let successCount = 0;
    let failCount = 0;

    for (const mapping of photoMappings) {
        console.log(`Processing: ${mapping.name}`);

        try {
            // Find student by name (case insensitive)
            const student = students.find(s =>
                s.name.toLowerCase() === mapping.name.toLowerCase()
            );

            if (!student) {
                console.log(`   ⚠️  Student not found in database`);
                failCount++;
                continue;
            }

            // Download image at highest quality
            const response = await axios.get(mapping.url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                }
            });

            // Compress with HIGH quality settings (800x800, 95% quality)
            const compressedBuffer = await sharp(response.data)
                .resize(800, 800, { fit: 'cover', withoutEnlargement: true })
                .webp({ quality: 95 })
                .toBuffer();

            const base64Photo = `data:image/webp;base64,${compressedBuffer.toString('base64')}`;

            // Update database
            await db.collection('students').doc(student.usn).update({
                photo: base64Photo,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`   ✅ Updated (${student.usn})\n`);
            successCount++;

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}\n`);
            failCount++;
        }
    }

    console.log('\n🎉 Summary:');
    console.log(`- Total: ${photoMappings.length}`);
    console.log(`- Success: ${successCount}`);
    console.log(`- Failed: ${failCount}`);

    process.exit(0);
}

updatePhotosHighQuality();
