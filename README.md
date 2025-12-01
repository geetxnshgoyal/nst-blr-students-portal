# Student Directory 🎓

A secure, professional student directory web application with password protection.

## Features

- 🔒 **Password Protection** - Secure access to student data
- 🔍 **Smart Search** - Search by name or email
- 📱 **Responsive Design** - Works on all devices
- 🎨 **Modern UI** - Clean, professional interface
- 🖼️ **Photo Grid** - Easy visual browsing

## Setup

### 1. Change Default Password

Edit `app.js` and change the password:
```javascript
const PASSWORD = "your-secure-password-here";
```

### 2. Deploy

Deploy to Vercel, Netlify, or any static hosting service.

## Privacy & Security

### Important Privacy Considerations

⚠️ **WARNING**: Photos and email addresses are stored locally in this repository and will be publicly accessible if deployed to a public hosting service.

### Recommendations for Enhanced Privacy

1. **Use a Private Repository**
   - Keep your GitHub repo private
   - Only share access with authorized users

2. **Use Environment Variables**
   - Store sensitive data in environment variables
   - Use a backend API for student data

3. **Image Storage Options**
   - Use cloud storage with access control (AWS S3, Cloudflare R2)
   - Implement authentication on image requests
   - Use signed URLs with expiration

4. **Alternative: Move to Backend**
   For better security, consider:
   - Node.js + Express backend
   - Database (MongoDB/PostgreSQL)
   - JWT authentication
   - Image upload to secure cloud storage

## Password

Default password: `svyasa2024`

**⚠️ Change this immediately after deployment!**

## Usage

1. Enter password on login screen
2. Search for students by name or email
3. Click any student card to view details
4. Logout when done

## Development

```bash
# Start local server
python3 -m http.server 8080
```

Visit: `http://localhost:8080`

## License

Private use only - SVYASA
