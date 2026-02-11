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
No complex installation required. Just clone and serve.

```bash
# Start local server
python3 -m http.server 8080
```

### 2. Access
Visit `http://localhost:8080` in your browser.

- **Default Password**: `12345678@`
- *Note: Please change this password in `app.js` line 2 for security.*

## 🔒 Security Note
This application uses simple client-side authentication for demonstration purposes. For production use, it is highly recommended to integrate a backend service (like Firebase authentication) and move sensitive data to a secure database.
