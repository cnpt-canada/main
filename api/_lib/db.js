// Supabase client using the service-role key. Server-only.
// Row level security is on for every table with no policies, so the public anon key can read nothing:
// all data goes through these API routes, which check who is asking.
import { createClient } from '@supabase/supabase-js';

let client = null;

export function hasDb() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function db() {
  if (!client) {
    if (!hasDb()) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

// Awaits a Supabase query and returns its data, throwing on error so routes fail in one place.
export async function run(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
