# Unique Constraint Fix

## Problem

The original migration kept the `is_justin` column which had a unique constraint on `(is_justin, version)`. This caused errors when trying to generate portraits for the new friends:

```
duplicate key value violates unique constraint "outputs_isjustin_version_key"
Key (is_justin, version)=(f, 1) already exists.
```

**Why this happened:**

- Old system: Each user (justin=true or emily=false) had their own version sequence
- New system: We added `person_name` but kept `is_justin`
- Problem: Lele, Serena, and Tiffany all have `is_justin=false`
- Result: They all tried to use `(false, 1)`, `(false, 2)`, etc., causing conflicts

## Solution

**Completely drop the `is_justin` column** and update the unique constraint:

1. ✅ Drop old constraint: `outputs_isjustin_version_key`
2. ✅ Add new constraint: `outputs_person_version_key` on `(person_name, version)`
3. ✅ Remove `is_justin` column from both `outputs` and `videos` tables
4. ✅ Update all backend code to only use `person_name`

## Changes Made

### 1. Updated `backend/migration.sql`

- Added step to drop old unique constraint
- Added step to create new unique constraint on `(person_name, version)`
- Added steps to drop `is_justin` column from both tables
- This is now a **breaking change** - not backward compatible

### 2. Updated `backend/controllers/supabase.js`

- Removed `isJustin` from `resolveUser()` return value
- Updated `uploadImageToSupabase()` to require `person_name` and not use `is_justin`
- Updated `getVideosForWeeks()` to only use `person_name`

### 3. Updated `backend/lib/generateNano.js`

- Removed `isJustin` variable from user resolution
- Removed `isJustin` from metadata object

### 4. Updated Documentation

- `MIGRATION_GUIDE.md` - Added breaking changes warning
- `QUICK_START.md` - Added warning about dropping column
- `CONSTRAINT_FIX.md` - This file

## Migration Instructions

### Step 1: Backup Database

```bash
# In Supabase dashboard, create a backup before proceeding
```

### Step 2: Run Updated Migration

```sql
-- Execute the updated backend/migration.sql
-- This will drop is_justin column and fix constraints
```

### Step 3: Verify Migration

Check that:

- ✅ `person_name` column exists
- ✅ Old constraint `outputs_isjustin_version_key` is gone
- ✅ New constraint `outputs_person_version_key` exists
- ✅ `is_justin` column is dropped

```sql
-- Verify person_name column
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'outputs' AND column_name = 'person_name';

-- Verify new constraint exists
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'outputs' AND constraint_name = 'outputs_person_version_key';

-- Verify is_justin is gone
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'outputs' AND column_name = 'is_justin';
-- Should return 0 rows
```

### Step 4: Deploy Backend Code

```bash
cd backend
vercel --prod
```

### Step 5: Test All Users

```bash
# Test image generation for all users
node lib/generateNano.js --user=justin
node lib/generateNano.js --user=emily
node lib/generateNano.js --user=lele
node lib/generateNano.js --user=serena
node lib/generateNano.js --user=tiffany
```

## Database Schema

### Before Migration

```sql
CREATE TABLE outputs (
  id SERIAL PRIMARY KEY,
  version INTEGER,
  is_justin BOOLEAN,
  -- ... other columns
  UNIQUE (is_justin, version)  -- OLD CONSTRAINT
);
```

### After Migration

```sql
CREATE TABLE outputs (
  id SERIAL PRIMARY KEY,
  version INTEGER,
  person_name TEXT,
  -- ... other columns
  UNIQUE (person_name, version)  -- NEW CONSTRAINT
);
```

## Version Sequences

Each person now has their own independent version sequence:

| person_name | version      |
| ----------- | ------------ |
| justin      | 1, 2, 3, ... |
| emily       | 1, 2, 3, ... |
| lele        | 1, 2, 3, ... |
| serena      | 1, 2, 3, ... |
| tiffany     | 1, 2, 3, ... |

No more conflicts! 🎉

## Rollback (Emergency Only)

If you need to rollback:

```sql
-- 1. Add is_justin column back
ALTER TABLE outputs ADD COLUMN is_justin BOOLEAN;
ALTER TABLE videos ADD COLUMN is_justin BOOLEAN;

-- 2. Populate based on person_name
UPDATE outputs SET is_justin = (person_name = 'justin');
UPDATE videos SET is_justin = (person_name = 'justin');

-- 3. Drop new constraint
ALTER TABLE outputs DROP CONSTRAINT outputs_person_version_key;

-- 4. Add old constraint back
ALTER TABLE outputs ADD CONSTRAINT outputs_isjustin_version_key UNIQUE (is_justin, version);

-- 5. Remove person_name (if desired)
-- Don't do this if you want to keep the new users!
```

⚠️ **Note**: Rollback will lose all data for Lele, Serena, and Tiffany since they can't fit in the `is_justin` boolean schema.

---

## Summary

- ✅ Fixed unique constraint conflict
- ✅ Dropped `is_justin` column completely
- ✅ Each user has independent version sequence
- ✅ All 5 users can now generate portraits
- ⚠️ Breaking change - requires immediate deployment
