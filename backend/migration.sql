-- Migration: Add person_name column and deprecate is_justin
-- This migration adds support for multiple users beyond justin and emily

-- Step 1: Add person_name column to outputs table
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS person_name TEXT;

-- Step 2: Migrate existing data in outputs table
UPDATE outputs SET person_name = 'justin' WHERE is_justin = true AND person_name IS NULL;
UPDATE outputs SET person_name = 'emily' WHERE is_justin = false AND person_name IS NULL;

-- Step 3: Add person_name column to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS person_name TEXT;

-- Step 4: Migrate existing data in videos table
UPDATE videos SET person_name = 'justin' WHERE is_justin = true AND person_name IS NULL;
UPDATE videos SET person_name = 'emily' WHERE is_justin = false AND person_name IS NULL;

-- Step 5: Drop old unique constraint on (is_justin, version)
ALTER TABLE outputs DROP CONSTRAINT IF EXISTS outputs_isjustin_version_key;

-- Step 6: Add new unique constraint on (person_name, version)
ALTER TABLE outputs ADD CONSTRAINT outputs_person_version_key UNIQUE (person_name, version);

-- Step 7: Add index on person_name for better query performance
CREATE INDEX IF NOT EXISTS idx_outputs_person_name ON outputs(person_name);
CREATE INDEX IF NOT EXISTS idx_videos_person_name ON videos(person_name);

-- Step 8: Add index on person_name and created_at for common queries
CREATE INDEX IF NOT EXISTS idx_outputs_person_created ON outputs(person_name, created_at DESC);

-- Step 9: Drop is_justin column from outputs (no longer needed)
ALTER TABLE outputs DROP COLUMN IF EXISTS is_justin;

-- Step 10: Drop is_justin column from videos (no longer needed)
ALTER TABLE videos DROP COLUMN IF EXISTS is_justin;

-- Verify migration
SELECT 'Migration complete. Outputs by person:' as message;
SELECT person_name, COUNT(*) as count FROM outputs GROUP BY person_name ORDER BY person_name;

SELECT 'Videos by person:' as message;
SELECT person_name, COUNT(*) as count FROM videos GROUP BY person_name ORDER BY person_name;

-- Verify unique constraint
SELECT 'Unique constraint on (person_name, version):' as message;
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'outputs' AND constraint_name = 'outputs_person_version_key';

