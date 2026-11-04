import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Provided credentials
const DEFAULT_SUPABASE_URL = 'https://acnbwepsrkiumbzcvlxf.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable__GbTpmR0zqqbwHJJRY1paQ_DM_sv9qx';

const SUPABASE_URL_KEY = 'zapprogramacerto_supabase_url';
const SUPABASE_KEY_KEY = 'zapprogramacerto_supabase_anon_key';

let cachedClient: SupabaseClient | null = null;

export function sanitizeSupabaseUrl(url: string): string {
  if (!url) return '';
  let clean = url.trim();
  // Strip trailing /rest/v1 or /rest/v1/ if user pasted REST URL directly
  clean = clean.replace(/\/rest\/v1\/?$/, '');
  clean = clean.replace(/\/+$/, '');
  return clean;
}

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const localUrl = typeof window !== 'undefined' ? localStorage.getItem(SUPABASE_URL_KEY) : null;
  const localKey = typeof window !== 'undefined' ? localStorage.getItem(SUPABASE_KEY_KEY) : null;

  const url = sanitizeSupabaseUrl(localUrl || DEFAULT_SUPABASE_URL);
  const anonKey = (localKey || DEFAULT_SUPABASE_ANON_KEY).trim();

  return { url, anonKey };
}

export function saveSupabaseCredentials(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url && anonKey) {
      localStorage.setItem(SUPABASE_URL_KEY, sanitizeSupabaseUrl(url));
      localStorage.setItem(SUPABASE_KEY_KEY, anonKey.trim());
    } else {
      localStorage.removeItem(SUPABASE_URL_KEY);
      localStorage.removeItem(SUPABASE_KEY_KEY);
    }
  }
  cachedClient = null;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const { url, anonKey } = getSupabaseCredentials();
  if (!url || !anonKey) return null;

  try {
    cachedClient = createClient(url, anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return cachedClient;
  } catch (err) {
    console.warn('Erro ao inicializar cliente Supabase:', err);
    return null;
  }
}

export const supabase = getSupabaseClient();
