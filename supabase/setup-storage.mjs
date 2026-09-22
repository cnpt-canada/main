// Creates the private storage bucket the process thumbnails live in. Run once per database, before the
// code that uses it goes live. Safe to run again: an existing bucket is left alone.
//
//   npx vercel env pull .env.prod --environment=production
//   node --env-file=.env.prod supabase/setup-storage.mjs
//
// Prints no secrets.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const BUCKET = 'process';
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: buckets, error: listError } = await db.storage.listBuckets();
if (listError) {
  console.error('could not read the buckets:', listError.message);
  process.exit(1);
}

if (buckets.some((b) => b.name === BUCKET)) {
  console.log(`bucket "${BUCKET}" is already there`);
} else {
  const { error } = await db.storage.createBucket(BUCKET, {
    public: false,                                   // the API hands out short-lived signed links instead
    fileSizeLimit: 3 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  });
  if (error) {
    console.error('could not create the bucket:', error.message);
    process.exit(1);
  }
  console.log(`bucket "${BUCKET}" created (private, images up to 3MB)`);
}
