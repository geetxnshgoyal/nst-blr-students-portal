// verify_abc_ids.js
const fs = require('fs');
const path = require('path');

const studentsPath = path.join(__dirname, 'students.json');
let students = [];
try {
  const data = fs.readFileSync(studentsPath, 'utf-8');
  students = JSON.parse(data);
} catch (e) {
  console.error('Failed to read students.json:', e);
  process.exit(1);
}

const missing = students.filter(s => !s.abc_id || s.abc_id.trim() === '');
if (missing.length === 0) {
  console.log('All student records have abc_id.');
  process.exit(0);
} else {
  console.error(`Found ${missing.length} records with missing abc_id.`);
  missing.forEach(s => console.error(`USN: ${s.usn}`));
  process.exit(1);
}
