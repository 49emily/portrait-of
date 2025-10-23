# Migration Guide: Adding Friends to Portrait of You

This guide documents the changes made to support multiple users beyond Justin and Emily.

## Summary of Changes

The system has been refactored to support 5 users total:

- **Main page (/)**: Justin and Emily (unchanged)
- **Friends page (/friends)**: Lele, Serena, and Tiffany (new)

### Database Changes

**New column added**: `person_name` (TEXT) to both `outputs` and `videos` tables

- Replaces the boolean `is_justin` field with a more flexible string identifier
- The old `(is_justin, version)` unique constraint is dropped
- New `(person_name, version)` unique constraint is added
- `is_justin` column is **completely removed** (not backward compatible)

### Backend Changes

1. **`backend/controllers/supabase.js`**:

   - Updated `resolveUser()` to support all 5 users
   - All database query functions now use `person_name` instead of `is_justin`
   - Functions updated: `getTodayImageCount`, `getWeeklyImageCount`, `getPortraitHistory`, `getLatestImageToday`, `getLatestImageAnyDay`, `getVideosForWeeks`, `uploadImageToSupabase`

2. **`backend/api/index.js`**:

   - Added RescueTime API keys for Lele, Serena, and Tiffany
   - Updated routes to work with any supported user
   - API version bumped to 3.0.0

3. **`backend/lib/generateNano.js`**:

   - Added support for all 5 users
   - Added base image mappings for new friends
   - Updated to use `person_name` throughout

4. **`backend/scripts/worker.js`**:

   - Now processes all 5 users in parallel
   - Updated user list: `["justin", "emily", "lele", "serena", "tiffany"]`

5. **`backend/env.template`**:
   - Added environment variable placeholders for new RescueTime API keys:
     - `RESCUETIME_API_KEY_LELE`
     - `RESCUETIME_API_KEY_SERENA`
     - `RESCUETIME_API_KEY_TIFF`

### Frontend Changes

1. **Routing Added**:

   - Installed `react-router-dom`
   - Updated `main.jsx` to wrap app with `<BrowserRouter>`
   - New `App.jsx` serves as router with two routes

2. **New Components**:

   - **`HomePage.jsx`**: Main page showing Justin and Emily (extracted from original App.jsx)
   - **`FriendsPage.jsx`**: New page showing Lele, Serena, and Tiffany at `/friends`

3. **Navigation**:
   - Friends page includes a "Back to Main Gallery" link
   - Both pages maintain the same UI/UX patterns

## Steps to Complete Migration

### 1. Run Database Migration

Execute the SQL migration file on your Supabase database:

```sql
-- File: backend/migration.sql
```

To apply:

1. **BACKUP YOUR DATABASE FIRST** (this migration drops the `is_justin` column)
2. Go to your Supabase dashboard
3. Navigate to the SQL Editor
4. Copy and paste the contents of `backend/migration.sql`
5. Execute the migration
6. Verify the output shows:
   - Existing data migrated correctly
   - Old constraint `outputs_isjustin_version_key` dropped
   - New constraint `outputs_person_version_key` created
   - `is_justin` column removed from both tables
7. **Deploy the updated backend code immediately** to avoid errors

### 2. Update Environment Variables

Add the new RescueTime API keys to your `.env` file:

```bash
# In backend/.env
RESCUETIME_API_KEY_LELE=your_actual_api_key_for_lele
RESCUETIME_API_KEY_SERENA=your_actual_api_key_for_serena
RESCUETIME_API_KEY_TIFFANY=your_actual_api_key_for_tiffany
```

### 3. Verify Base Images Exist

Ensure the following base images are present in `backend/images/`:

- ✅ `justin_base.png`
- ✅ `emily_base.jpg`
- ✅ `lele_base.jpeg`
- ✅ `serena_base.jpeg`
- ✅ `tiffany_base.jpg`

### 4. Test Backend Locally

```bash
cd backend
npm install  # If needed
node lib/generateNano.js --user=lele      # Test Lele
node lib/generateNano.js --user=serena    # Test Serena
node lib/generateNano.js --user=tiffany   # Test Tiffany
```

### 5. Test Frontend Locally

```bash
cd frontend
npm install  # Installs react-router-dom if not already
npm run dev
```

Visit:

- `http://localhost:5173/` - Should show Justin and Emily
- `http://localhost:5173/friends` - Should show Lele, Serena, and Tiffany

### 6. Deploy

#### Backend (Vercel)

```bash
cd backend
vercel --prod
```

Make sure to add the new environment variables in Vercel:

- `RESCUETIME_API_KEY_LELE`
- `RESCUETIME_API_KEY_SERENA`
- `RESCUETIME_API_KEY_TIFFANY`

#### Frontend

```bash
cd frontend
npm run build
# Deploy dist/ folder as usual
```

## API Endpoints

### New/Updated Endpoints

All endpoints now support 5 users: `justin`, `emily`, `lele`, `serena`, `tiffany`

- `GET /api/:user/portrait-history` - Get portrait history for any user
- `GET /api/:user/current-screentime` - Get screentime data for any user
- `GET /api/videos` - Get all video replays (currently only Justin/Emily have videos)

### Example API Calls

```bash
# Get Lele's portraits
curl https://your-api.com/api/lele/portrait-history

# Get Serena's screentime
curl https://your-api.com/api/serena/current-screentime

# Get Tiffany's portraits
curl https://your-api.com/api/tiffany/portrait-history
```

## Breaking Changes

⚠️ **Important**: This migration is **NOT backward compatible**

- The `is_justin` column is **completely dropped** from both tables
- The old unique constraint on `(is_justin, version)` is removed
- New unique constraint on `(person_name, version)` is added
- All code now uses `person_name` exclusively
- Any external code or queries using `is_justin` will break

**Before running the migration**, ensure:

1. No other services are querying the `is_justin` column
2. You have a backup of your database
3. You're ready to deploy the updated backend code immediately after migration

## Testing Checklist

- [ ] Database migration completed successfully
- [ ] All 5 base images present in backend/images/
- [ ] Environment variables added for Lele, Serena, Tiffany
- [ ] Backend API responds for all 5 users
- [ ] Main page (/) displays Justin and Emily correctly
- [ ] Friends page (/friends) displays Lele, Serena, Tiffany correctly
- [ ] Navigation between pages works
- [ ] Portrait history loads for all users
- [ ] Screentime data loads for all users
- [ ] Image generation works for all users
- [ ] Worker processes all 5 users

## Troubleshooting

### "Unknown user" error

- Make sure the user name is lowercase (justin, emily, lele, serena, tiffany)
- Check that `resolveUser()` includes the user in the validUsers array

### "Missing RescueTime key" error

- Verify environment variables are set correctly
- Check that keys are named exactly: `RESCUETIME_API_KEY_JUSTIN`, `RESCUETIME_API_KEY_EMILY`, etc.

### Database query errors

- Run the migration script if you haven't already
- Check that `person_name` column exists in both `outputs` and `videos` tables
- Verify existing data has been migrated (NULL person_name values should be filled)

### Routing not working in production

- Make sure your hosting platform (Vercel/Netlify/etc.) is configured for SPA routing
- Add a `vercel.json` or equivalent to handle client-side routing

## Notes

- The main page remains unchanged for end users
- Friends page is a separate route that doesn't interfere with the main gallery
- All existing functionality for Justin and Emily is preserved
- The video replay section still only shows Justin and Emily (as intended)
- Each friend's portrait (Lele, Serena, Tiffany) operates independently with their own RescueTime data
- Weekly reset happens on Sunday for all users
- Same 30-minute threshold increment applies to all users

## Architecture

```
Frontend:
  / (HomePage)           → Justin + Emily + History videos
  /friends (FriendsPage) → Lele + Serena + Tiffany

Backend API:
  /api/:user/portrait-history     → Person's portrait generations
  /api/:user/current-screentime   → Person's brainrot metrics
  /api/videos                     → Weekly video replays

Database (Supabase):
  outputs table:
    - person_name (NEW, primary identifier)
    - is_justin (deprecated, kept for compatibility)
    - version (per-person versioning)

  videos table:
    - person_name (NEW)
    - is_justin (deprecated)
    - week
```

---

**Migration completed successfully!** 🎉

All code changes are ready. You just need to:

1. Run the SQL migration
2. Add the 3 new RescueTime API keys to your environment
3. Test and deploy
