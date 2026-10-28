import { createClient } from '@supabase/supabase-js';
import { ServiceError } from './contracts';

export const SUPABASE_PROJECT_URL = 'https://luyyxblmtupmugtazgbr.supabase.co';
export const SUPABASE_STORAGE_KEY = 'spextar.backend.luyyxblmtupmugtazgbr.auth';
export function createStudioSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url !== SUPABASE_PROJECT_URL || !/^sb_publishable_[A-Za-z0-9_-]+(?![\s\S])/.test(key ?? '')) {
    throw new ServiceError('The approved Supabase project URL and publishable key must be configured.', 'unavailable');
  }
  return createClient(url, key, {
    auth: {
      storageKey: SUPABASE_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
