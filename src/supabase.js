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
export async function loadAllPricesFromCloud(currency = 15) {

  const client = getClient();
  if (!client) return null;

  const tableName = currency === 1 ? 'skin_prices_usd' : 'skin_prices_vnd';

  try {
    const { data, error } = await client
      .from(tableName)
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
export async function syncPriceToCloud(marketHashName, wear, price, volume, currency = 15) {

  const client = getClient();
  if (!client) return;

  const tableName = currency === 1 ? 'skin_prices_usd' : 'skin_prices_vnd';

  try {
    const { error } = await client
      .from(tableName)
      .upsert({ 
        market_hash_name: marketHashName, 
        wear, 
        price, 
        volume,
        updated_at: new Date().toISOString() 
      }, { onConflict: 'market_hash_name,wear' });

    if (error) {
      console.error('[Supabase] Sync error:', error.message);
    }
  } catch (e) {
    // Silent fail — cloud sync is best-effort
    console.warn('[Supabase] Sync failed for', marketHashName, wear, e);
  }
}

/**
 * Batch sync multiple prices to Supabase.
 * More efficient than individual upserts.
 */
export async function batchSyncToCloud(entries, currency = 15) {
  const client = getClient();
  if (!client || !entries.length) return;

  const tableName = currency === 1 ? 'skin_prices_usd' : 'skin_prices_vnd';

  const rows = entries.map(e => ({
    market_hash_name: e.marketHashName,
    wear: e.wear,
    price: e.price,
    volume: e.volume || 0,
    updated_at: new Date().toISOString()
  }));

  try {
    const { error } = await client
      .from(tableName)
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
export async function getCloudLastUpdated(currency = 15) {
  const client = getClient();
  if (!client) return null;

  const tableName = currency === 1 ? 'skin_prices_usd' : 'skin_prices_vnd';

  try {
    const { data, error } = await client
      .from(tableName)
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0].updated_at;
  } catch (e) {
    return null;
  }
}

// === Calculator Simulations ===

/**
 * Load all simulations for a given user ID.
 */
export async function loadSimulations(userId) {
  const client = getClient();
  if (!client || !userId) return [];

  try {
    const { data, error } = await client
      .from('simulations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Supabase] Load simulations error:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error('[Supabase] Load simulations failed:', e);
    return [];
  }
}

/**
 * Create a new simulation for a user.
 */
export async function createSimulation(userId, name) {
  const client = getClient();
  if (!client || !userId) return null;

  try {
    const { data, error } = await client
      .from('simulations')
      .insert([{ user_id: userId, name: name, items: {} }])
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Create simulation error:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.error('[Supabase] Create simulation failed:', e);
    return null;
  }
}

/**
 * Update items (JSON) of a specific simulation.
 */
export async function updateSimulationItems(simulationId, items) {
  const client = getClient();
  if (!client || !simulationId) return;

  try {
    const { error } = await client
      .from('simulations')
      .update({ items, updated_at: new Date().toISOString() })
      .eq('id', simulationId);

    if (error) {
      console.error('[Supabase] Update simulation items error:', error.message);
    }
  } catch (e) {
    console.error('[Supabase] Update simulation items failed:', e);
  }
}

/**
 * Rename a simulation.
 */
export async function renameSimulation(simulationId, newName) {
  const client = getClient();
  if (!client || !simulationId || !newName) return;

  try {
    const { error } = await client
      .from('simulations')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', simulationId);

    if (error) {
      console.error('[Supabase] Rename simulation error:', error.message);
    }
  } catch (e) {
    console.error('[Supabase] Rename simulation failed:', e);
  }
}

/**
 * Delete a simulation.
 */
export async function deleteSimulation(simulationId) {
  const client = getClient();
  if (!client || !simulationId) return;

  try {
    const { error } = await client
      .from('simulations')
      .delete()
      .eq('id', simulationId);

    if (error) {
      console.error('[Supabase] Delete simulation error:', error.message);
    }
  } catch (e) {
    console.error('[Supabase] Delete simulation failed:', e);
  }
}
