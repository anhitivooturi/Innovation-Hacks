# 🚀 Quick Start - Firestore Live Mode

**3-step setup to activate real-time updates:**

---

## Step 1: Copy Environment File
```bash
cd frontend
cp .env.example .env
```

---

## Step 2: Add Firebase Credentials

Edit `frontend/.env` and add your Firebase credentials:

```bash
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=devlog-vibhor-gemini.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=devlog-vibhor-gemini
VITE_FIREBASE_STORAGE_BUCKET=devlog-vibhor-gemini.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Get credentials from:**  
https://console.firebase.google.com/ → Project settings → Your apps

---

## Step 3: Start Dev Server
```bash
npm run dev
```

**Open:** http://localhost:5173

---

## ✅ Verify Live Mode

You should see:

```
┌──────────────────────────────────────────────┐
│ 🔥 Live Mode Active - Connected to Firestore│
│    Real-time updates                         │
└──────────────────────────────────────────────┘
```

And in the browser console:
```
🔥 Connecting to Firestore...
📍 Project: devlog-vibhor-gemini
✅ Firestore: X changes loaded
✅ Firestore: devlog/current loaded
🎧 Firestore listeners active
```

---

## 🧪 Test Real-time Updates

1. Dashboard running at http://localhost:5173
2. In another terminal, trigger a file change (watcher running)
3. **Watch timeline update instantly!** No refresh needed ✨

---

## ⚠️ Troubleshooting

### Still seeing "Mock Mode"?

**Check credentials:**
```bash
cat .env | grep VITE_FIREBASE_
```

All values should be filled (not empty).

**Check console for errors:**
- Open DevTools → Console
- Look for red error messages
- See `FIRESTORE_SETUP.md` for detailed troubleshooting

---

## 📚 Documentation

- **Setup Guide:** `FIRESTORE_SETUP.md`
- **Complete Summary:** `../FIRESTORE_LIVE_MODE.md`
- **Backend Integration:** `../SYSTEM_READY.md`

---

**That's it! You're live! 🎉**
