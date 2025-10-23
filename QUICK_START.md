# Quick Start Guide

## What Changed?

✅ **Backend now supports 5 users instead of 2**

- `is_justin` → `person_name` (justin, emily, lele, serena, tiffany)

✅ **Frontend now has 2 routes**

- `/` → Justin & Emily (main page)
- `/friends` → Lele, Serena & Tiffany (new page)

## ⚠️ Important Warning

This migration **drops the `is_justin` column** from your database. Make sure to:

- Backup your database first
- Deploy backend code immediately after migration
- No other services are using the `is_justin` column

## Quick Setup (3 Steps)

### 1. Run SQL Migration 🗄️

**BACKUP YOUR DATABASE FIRST!**

Copy the contents of `backend/migration.sql` and run it in your Supabase SQL Editor.

This will:

- Add `person_name` column
- Migrate existing data
- Drop old `(is_justin, version)` constraint
- Add new `(person_name, version)` constraint
- **Remove `is_justin` column completely**

### 2. Add API Keys 🔑

Add these to your `backend/.env` (and Vercel environment variables):

```bash
RESCUETIME_API_KEY_LELE=your_key_here
RESCUETIME_API_KEY_SERENA=your_key_here
RESCUETIME_API_KEY_TIFFANY=your_key_here
```

### 3. Test & Deploy 🚀

**Backend test:**

```bash
cd backend
node lib/generateNano.js --user=lele
```

**Frontend test:**

```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:5173/ and http://localhost:5173/friends
```

**Deploy:**

```bash
# Backend
cd backend
vercel --prod

# Frontend
cd frontend
npm run build
# Deploy dist/ folder
```

## Routes

| Route      | Users                 | Description              |
| ---------- | --------------------- | ------------------------ |
| `/`        | Justin, Emily         | Main gallery with videos |
| `/friends` | Lele, Serena, Tiffany | Friends gallery          |

## API Endpoints

```
GET /api/justin/portrait-history
GET /api/emily/portrait-history
GET /api/lele/portrait-history      ← NEW
GET /api/serena/portrait-history    ← NEW
GET /api/tiffany/portrait-history   ← NEW

GET /api/:user/current-screentime
GET /api/videos
```

## Files Modified

### Backend

- ✏️ `controllers/supabase.js` - Database queries now use person_name
- ✏️ `api/index.js` - API routes support all 5 users
- ✏️ `lib/generateNano.js` - Image generation for all users
- ✏️ `scripts/worker.js` - Processes all 5 users
- ✏️ `env.template` - Added new API key placeholders
- ➕ `migration.sql` - Database migration script (NEW)

### Frontend

- ✏️ `src/main.jsx` - Added BrowserRouter
- ✏️ `src/App.jsx` - Now just handles routing
- ➕ `src/HomePage.jsx` - Main page (Justin & Emily) (NEW)
- ➕ `src/FriendsPage.jsx` - Friends page (Lele, Serena, Tiff) (NEW)

### Documentation

- ➕ `MIGRATION_GUIDE.md` - Detailed migration guide (NEW)
- ➕ `QUICK_START.md` - This file (NEW)

## Common Issues

**"Missing RescueTime key"**
→ Add `RESCUETIME_API_KEY_LELE`, `RESCUETIME_API_KEY_SERENA`, `RESCUETIME_API_KEY_TIFFANY` to your env

**"Unknown user"**
→ Make sure user names are lowercase (justin, emily, lele, serena, tiffany)

**Routing not working after deploy**
→ Configure your hosting for SPA routing (e.g., add `vercel.json` for Vercel)

**Database errors**
→ Run the migration.sql script first

## Need Help?

See `MIGRATION_GUIDE.md` for detailed information about all changes.

---

🎉 **You're all set!** Once you complete the 3 steps above, your gallery will support all 5 users.
