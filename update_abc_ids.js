// update_abc_ids.js
const fs = require('fs');
const path = require('path');

const abcPath = path.join(__dirname, 'abc.txt');
const studentsPath = path.join(__dirname, 'students.json');

// Read abc.txt and build USN -> abc_id map
const abcLines = fs.readFileSync(abcPath, 'utf-8').split(/\r?\n/).filter(Boolean);
const usnToAbcId = {};
abcLines.forEach(line => {
  // Expected format: Name\tUSN\tabc_id (abc_id may be empty)
  const parts = line.split('\t');
  if (parts.length >= 2) {
    const usn = parts[1].trim();
    const abcId = parts[2] ? parts[2].trim() : '';
    usnToAbcId[usn] = abcId;
  }
});

// Load students.json
let students = [];
try {
  const data = fs.readFileSync(studentsPath, 'utf-8');
  students = JSON.parse(data);
} catch (e) {
  console.error('Failed to read students.json:', e);
  process.exit(1);
}

let updatedCount = 0;
students.forEach(student => {
  if (!student.abc_id || student.abc_id.trim() === '') {
    const newId = usnToAbcId[student.usn] || '';
    if (newId) {
      student.abc_id = newId;
      updatedCount++;
    }
  }
});

// Write back
fs.writeFileSync(studentsPath, JSON.stringify(students, null, 2), 'utf-8');
console.log(`Updated ${updatedCount} student records with abc_id.`);
