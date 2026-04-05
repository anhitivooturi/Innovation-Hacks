# 🔍 Console Output Reference

**What you should see when Firestore is working correctly**

---

## ✅ Success Output

```
============================================================
🔥 FIRESTORE CONNECTION STARTING
============================================================
✅ Firebase configured
📍 Project: devlog-vibhor-gemini

📊 CHANGES SNAPSHOT:
   Docs count: 5
   Empty? false
   Change doc: abc123def456 {timestamp: "2026-04-04T12:00:00Z", file: "api/main.py", ...}
   Change doc: def456ghi789 {timestamp: "2026-04-04T11:55:00Z", file: "agent/gemini.py", ...}
   ...
   Processed: 5 changes
CHANGES DATA: [
  {
    "id": "abc123def456",
    "file": "api/main.py",
    "timestamp": "2026-04-04T12:00:00Z",
    "classification": "feature",
    "summary": "Added new endpoint for handoff generation",
    "danger": false,
    "agent": "DevLog AI"
  },
  ...
]

📄 DEVLOG SNAPSHOT:
   Exists? true
   Data: {content: "# DevLog\n\n### 2026-04-04...", lastUpdated: "..."}
DEVLOG DATA: {
  "id": "current",
  "content": "# DevLog\n\n### 2026-04-04 12:00:00 — FEATURE...",
  "lastUpdated": "2026-04-04T12:00:00Z"
}

💡 DECISIONS SNAPSHOT: 2 docs
DECISIONS DATA: [...]

🏥 STATUS SNAPSHOT:
   Exists? true
   Data: {projectHealth: "healthy", lastUpdated: "..."}
STATUS DATA: {
  "projectHealth": "healthy",
  "lastUpdated": "2026-04-04T12:00:00Z",
  "files": {}
}

📸 SNAPSHOTS SNAPSHOT: 3 docs
SNAPSHOTS DATA: [...]

✅ TODOS SNAPSHOT: 1 docs
TODOS DATA: [...]

✅ All Firestore listeners active!
============================================================
```

---

## ⚠️ Empty Collections (Not an error)

```
============================================================
🔥 FIRESTORE CONNECTION STARTING
============================================================
✅ Firebase configured
📍 Project: devlog-vibhor-gemini

📊 CHANGES SNAPSHOT:
   Docs count: 0
   Empty? true
⚠️  No changes yet in Firestore

📄 DEVLOG SNAPSHOT:
   Exists? false
⚠️  devlog/current does not exist yet

💡 DECISIONS SNAPSHOT: 0 docs
🏥 STATUS SNAPSHOT:
   Exists? false
⚠️  status/current does not exist yet

📸 SNAPSHOTS SNAPSHOT: 0 docs
✅ TODOS SNAPSHOT: 0 docs

✅ All Firestore listeners active!
============================================================
```

**This is OK!** Collections are empty because no changes have been made yet.

**Fix:** Trigger watcher to send a change, or manually add data to Firestore.

---

## ❌ Error: Firebase Not Configured

```
============================================================
🔥 FIRESTORE CONNECTION STARTING
============================================================
❌ ERROR: Firebase not configured - check .env file
```

**Fix:**
```bash
# Check .env file
cat frontend/.env

# Should have all Firebase credentials
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=devlog-vibhor-gemini.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=devlog-vibhor-gemini
# etc.

# Restart dev server
npm run dev
```

---

## ❌ Error: Permission Denied

```
✅ Firebase configured
📍 Project: devlog-vibhor-gemini

❌ CHANGES ERROR: Missing or insufficient permissions
   Full error: FirebaseError: Missing or insufficient permissions.
```

**Fix:**
```javascript
// Update Firestore rules in Firebase Console
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // For development
    }
  }
}
```

---

## ❌ Error: Failed to Get Document

```
❌ DEVLOG ERROR: Failed to get document
   Full error: FirebaseError: [code=not-found]: Document not found
```

**This is OK!** Document doesn't exist yet. Listener handles this gracefully.

---

## 🎯 Quick Debug Checklist

### 1. Check if Firebase is initialized:
```
Look for: "✅ Firebase configured"
```

### 2. Check if listeners are active:
```
Look for: "✅ All Firestore listeners active!"
```

### 3. Check data is arriving:
```
Look for: "CHANGES DATA: [...]" with actual data
```

### 4. Check for errors:
```
Look for: "❌" symbols in console
```

---

## 📊 Data Format Examples

### Change Document:
```json
{
  "id": "abc123",
  "file": "api/main.py",
  "timestamp": "2026-04-04T12:00:00Z",
  "classification": "feature",
  "summary": "Added new endpoint",
  "danger": false,
  "agent": "DevLog AI"
}
```

### Devlog Document:
```json
{
  "id": "current",
  "content": "# DevLog\n\n### 2026-04-04 — FEATURE\n\n**File**: `api/main.py`...",
  "lastUpdated": "2026-04-04T12:00:00Z"
}
```

### Decision Document:
```json
{
  "id": "decision123",
  "timestamp": "2026-04-04T12:00:00Z",
  "source": "Claude Code",
  "type": "architecture",
  "summary": "Decided to use Firestore for real-time updates",
  "details": "Firestore provides real-time listeners..."
}
```

### Status Document:
```json
{
  "projectHealth": "healthy",
  "lastUpdated": "2026-04-04T12:00:00Z",
  "files": {}
}
```

---

## 🔄 Real-time Update Flow

```
1. Backend writes to Firestore
   └─> Firestore changes collection updated

2. onSnapshot listener fires (< 100ms)
   └─> Console logs: "📊 CHANGES SNAPSHOT:"

3. Data processed and logged
   └─> Console logs: "CHANGES DATA: [...]"

4. State updated
   └─> setTimeline(data)

5. UI re-renders
   └─> Timeline shows new entry

Total time: < 200ms from write to UI update
```

---

## 🎨 UI Indicators

### When console shows success:

**UI should display:**
```
┌──────────────────────────────────────────────┐
│ 🔥 Live Mode Active - Connected to Firestore│
│    Real-time updates                         │
└──────────────────────────────────────────────┘

Connection Card:
🔥 Live
Firestore connected
[Green WiFi icon]
```

### When console shows empty collections:

**UI should display:**
```
Timeline Panel:
┌──────────────────────────────┐
│ 🕐 No changes yet            │
│                              │
│ Firestore is connected and   │
│ listening. Waiting for file  │
│ changes...                   │
│                              │
│ Check browser console for    │
│ Firestore connection logs    │
└──────────────────────────────┘
```

### When console shows errors:

**UI should display:**
```
┌──────────────────────────────────────────────┐
│ ❌ Connection Error                          │
│    Firebase not configured - check .env file │
└──────────────────────────────────────────────┘

Connection Card:
❌ Error
Firebase not configured
[Red WiFi-off icon]
```

---

## 🚀 Expected Timeline

```
0ms    - Page loads
100ms  - Console: "🔥 FIRESTORE CONNECTION STARTING"
200ms  - Console: "✅ Firebase configured"
300ms  - Listeners initialized
400ms  - First snapshots arrive
500ms  - Console: "CHANGES DATA: [...]"
600ms  - UI updates
700ms  - Banner switches to "🔥 Live Mode Active"
```

---

**Use this reference to verify Firestore is working correctly! 🔍**
