import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client for cloud price storage.
 * 
 * Data is PUBLIC — no auth required.
 * Anyone can read/write prices (it's all public CS2 market data).
 * 
 * To set up:
 * 1. Create a free project at https://supabase.com
 * 2. Create the skin_prices table (SQL below)
 * 3. Disable RLS on the table (public data)
 * 4. Set your URL and anon key in .env
 * 
 * SQL to create table:
 * 
 *   CREATE TABLE skin_prices (
 *     id SERIAL PRIMARY KEY,
 *     market_hash_name TEXT NOT NULL,
 *     wear TEXT NOT NULL,
 *     price INTEGER,
 *     volume INTEGER DEFAULT 0,
 *     updated_at TIMESTAMPTZ DEFAULT NOW(),
 *     UNIQUE(market_hash_name, wear)
 *   );
 *   
 *   -- Disable RLS (public data)
 *   ALTER TABLE skin_prices DISABLE ROW LEVEL SECURITY;
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;

/**
 * Check if Supabase is configured.
 */
export function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Get or create the Supabase client.
 */
function getClient() {
  if (!supabase && isSupabaseConfigured()) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

/**
 * Load ALL prices from Supabase.
 * Returns an object: { "marketHashName": { "wear": { price, volume, success } } }
 */
export async function loadAllPricesFromCloud() {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('skin_prices')
      .select('market_hash_name, wear, price, volume, updated_at');

    if (error) {
      console.error('[Supabase] Load error:', error.message);
      return null;
    }

    // Convert flat rows to nested cache format
    const cache = {};
    for (const row of data) {
      const key = row.market_hash_name;
      if (!cache[key]) cache[key] = {};
      cache[key][row.wear] = {
        price: row.price,
        volume: row.volume || 0,
        success: row.price !== null,
        cloudUpdatedAt: row.updated_at,
      };
    }

    console.log(`[Supabase] Loaded ${data.length} price entries from cloud`);
    return cache;
  } catch (e) {
    console.error('[Supabase] Load failed:', e);
    return null;
  }
}

/**
 * Sync a single price entry to Supabase (upsert).
 * The latest write wins (based on updated_at).
 */
export async function syncPriceToCloud(marketHashName, wear, price, volume) {
  const client = getClient();
  if (!client) return;

  try {
    await client
      .from('skin_prices')
      .upsert({
        market_hash_name: marketHashName,
        wear,
        price,
        volume: volume || 0,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'market_hash_name,wear',
      });
  } catch (e) {
    // Silent fail — cloud sync is best-effort
    console.warn('[Supabase] Sync failed for', marketHashName, wear, e);
  }
}

/**
 * Batch sync multiple prices to Supabase.
 * More efficient than individual upserts.
 */
export async function batchSyncToCloud(entries) {
  const client = getClient();
  if (!client || entries.length === 0) return;

  try {
    // Supabase upsert supports batch
    const rows = entries.map(e => ({
      market_hash_name: e.marketHashName,
      wear: e.wear,
      price: e.price,
      volume: e.volume || 0,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await client
      .from('skin_prices')
      .upsert(rows, { onConflict: 'market_hash_name,wear' });

    if (error) {
      console.error('[Supabase] Batch sync error:', error.message);
    } else {
      console.log(`[Supabase] Synced ${rows.length} prices to cloud`);
    }
  } catch (e) {
    console.warn('[Supabase] Batch sync failed:', e);
  }
}

/**
 * Get the last update timestamp from Supabase.
 */
export async function getCloudLastUpdated() {
  const client = getClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('skin_prices')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0].updated_at;
  } catch (e) {
    return null;
  }
}
