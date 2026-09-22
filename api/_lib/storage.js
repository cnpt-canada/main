// Process thumbnails live in a private Supabase Storage bucket. The service-role key stays on the server:
// the browser never talks to storage directly, it gets a short-lived signed link from /api/process.
// The bucket is created by supabase/setup-storage.mjs — see SETUP.md.
import { db } from './db.js';
import { IMAGE_TYPES } from './rules.js';

export const BUCKET = 'process';
const LINK_SECONDS = 60 * 60; // an hour is plenty for a page view, and the link cannot be shared for long

// Saves the image and returns its path in the bucket. One object per client, replaced on every upload.
export async function saveImage(userId, bytes, contentType) {
  const path = `${userId}/thumbnail.${IMAGE_TYPES[contentType]}`;
  const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

// A link the browser can load for a while. Returns null when there is no image or the link can't be made,
// so a missing picture never takes the page down.
export async function imageLink(path) {
  if (!path) return null;
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error) {
    console.error('storage: could not sign the image link', error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function removeImage(path) {
  if (!path) return;
  const { error } = await db().storage.from(BUCKET).remove([path]);
  if (error) console.error('storage: could not remove the image', error);
}
