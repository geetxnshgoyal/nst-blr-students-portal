# Student Portal 🎓

A modern, secure student portal featuring a dashboard, student directory, and academic tools.

## ✨ Features

### 🖥️ Dashboard
- **Welcome Hub**: Personalized greeting and quick stats.
- **🎂 Upcoming Birthdays**: View students with birthdays in the next 30 days.
- **📊 Quick Stats**: Real-time student count and date.

### 👥 Student Directory
- **Smart Search**: Filter by name, USN, email, or batch.
- **Detailed Profiles**: Click any student to view their full profile in a glassmorphic modal.
- **Social Links**: Direct access to GitHub and LinkedIn profiles.

### 🚀 Upcoming Modules
- 📅 **Timetable** (Coming Soon)
- 📝 **Exams** (Coming Soon)
- 📚 **Syllabus** (Coming Soon)

## 🛠️ Setup & Usage

### 1. Installation
No complex installation required. Just clone and use npm to run the server.

```bash
# Install dependencies
npm install
# Start local server (recommended)
npm start
# Or run in development with automatic restart
npm run dev
```

### 2. Access
Visit `http://localhost:3000` in your browser (or the port in $PORT).

- **Default Password (local dev)**: `12345678`
- **Configuration**: Set the password securely in environment variables:
  - `PASSWORD` &mdash; plaintext password (server will hash it at startup)
  - `PASSWORD_HASH` &mdash; precomputed bcrypt hash to avoid storing plaintext

> **Tip**: For production, always use `PASSWORD_HASH` and never commit secrets to source control.

## 🔒 Security Note
This application uses simple client-side authentication for demonstration purposes. For production use, it is highly recommended to integrate a backend service (like Firebase authentication) and move sensitive data to a secure database.
