import { useState, useEffect, useCallback, useRef } from 'react';
import { getCorrectRarityChances, WEAR_CHANCES, STAR_COST_VND } from '../utils/constants';
import {
  isSupabaseConfigured,
  loadAllPricesFromCloud,
  syncPriceToCloud,
  batchSyncToCloud,
} from '../supabase';

const CACHE_KEY = 'csroi_priceCache';
const UPDATED_KEY = 'csroi_lastUpdated';

/**
 * Custom hook to manage price caching with localStorage + Supabase cloud sync.
 * 
 * On startup:
 *   1. Load from localStorage (instant)
 *   2. Load from Supabase cloud (background)
 *   3. Merge: cloud wins if newer
 * 
 * On price fetch:
 *   1. Save to localStorage (instant)
 *   2. Queue cloud sync (batched, non-blocking)
 */
export function usePriceCache() {
  const [skinPrices, setSkinPrices] = useState(() => {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  const [lastUpdated, setLastUpdated] = useState(
    () => localStorage.getItem(UPDATED_KEY) || null
  );

  const [cloudStatus, setCloudStatus] = useState(
    isSupabaseConfigured() ? 'idle' : 'disabled'
  ); // 'disabled' | 'idle' | 'loading' | 'synced' | 'error'

  // Batch sync queue
  const syncQueueRef = useRef([]);
  const syncTimerRef = useRef(null);

  // Persist to localStorage whenever prices change
  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(skinPrices));
    } catch { /* quota exceeded, ignore */ }
  }, [skinPrices]);

  // Load from Supabase on startup
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    async function loadFromCloud() {
      setCloudStatus('loading');
      try {
        const cloudData = await loadAllPricesFromCloud();
        if (cloudData && Object.keys(cloudData).length > 0) {
          // Merge cloud data into local cache (cloud wins for any key)
          setSkinPrices(prev => {
            const merged = { ...prev };
            for (const [key, wears] of Object.entries(cloudData)) {
              if (!merged[key]) {
                merged[key] = wears;
              } else {
                for (const [wear, data] of Object.entries(wears)) {
                  // Cloud wins if local doesn't have it or local has no price
                  if (!merged[key][wear] || !merged[key][wear].success) {
                    merged[key][wear] = data;
                  }
                }
              }
            }
            return merged;
          });
          setCloudStatus('synced');
        } else {
          setCloudStatus('idle');
        }
      } catch {
        setCloudStatus('error');
      }
    }

    loadFromCloud();
  }, []);

  // Flush sync queue to Supabase (batched every 3 seconds)
  const flushSyncQueue = useCallback(() => {
    if (syncQueueRef.current.length === 0) return;
    const entries = [...syncQueueRef.current];
    syncQueueRef.current = [];
    batchSyncToCloud(entries).catch(() => {});
  }, []);

  const markUpdated = useCallback(() => {
    const now = Date.now().toString();
    localStorage.setItem(UPDATED_KEY, now);
    setLastUpdated(now);
  }, []);

  const updatePrice = useCallback((key, wear, priceData) => {
    setSkinPrices(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), [wear]: priceData }
    }));

    if (priceData.success) {
      markUpdated();

      // Queue cloud sync
      if (isSupabaseConfigured()) {
        syncQueueRef.current.push({
          marketHashName: key,
          wear,
          price: priceData.price,
          volume: priceData.volume || 0,
        });

        // Debounce: flush every 3 seconds
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(flushSyncQueue, 3000);
      }
    }
  }, [markUpdated, flushSyncQueue]);

  const getPrice = useCallback((key) => {
    return skinPrices[key] || {};
  }, [skinPrices]);

  const hasPrice = useCallback((key) => {
    return skinPrices[key] && Object.keys(skinPrices[key]).length > 0;
  }, [skinPrices]);

  /**
   * Get WEIGHTED average price for a skin across all cached wears.
   * Uses CSROI.com's wear distribution: FN 3%, MW 24%, FT 33%, WW 24%, BS 16%
   */
  const getWeightedAvgPrice = useCallback((marketHashNameBase, supportedWears) => {
    const cached = skinPrices[marketHashNameBase];
    if (!cached) return null;

    const isNormalOnly = supportedWears && supportedWears.length === 1 && supportedWears[0] === 'Normal';

    if (isNormalOnly) {
      const normalData = cached['Normal'];
      if (normalData && normalData.success && normalData.price) {
        return normalData.price;
      }
      return null;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [wear, chance] of Object.entries(WEAR_CHANCES)) {
      if (supportedWears && !supportedWears.includes(wear)) continue;
      const wearData = cached[wear];
      if (wearData && wearData.success && wearData.price) {
        const weight = chance / 100;
        weightedSum += wearData.price * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return null;
    return weightedSum / totalWeight;
  }, [skinPrices]);

  /**
   * Get simple average price (backward compat)
   */
  const getAvgPrice = useCallback((marketHashNameBase) => {
    const cached = skinPrices[marketHashNameBase];
    if (!cached) return null;
    const wearPrices = Object.values(cached)
      .filter(p => p && p.success && p.price)
      .map(p => p.price);
    if (wearPrices.length === 0) return null;
    return wearPrices.reduce((a, b) => a + b, 0) / wearPrices.length;
  }, [skinPrices]);

  /**
   * Calculate ROI using CSROI.com's exact formulas.
   */
  const getCollectionROI = useCallback((collection, includeFee) => {
    if (!collection || !collection.rarities) return null;

    let avgUnboxValue = 0;
    let hasAnyPrice = false;

    const numTiers = collection.rarities.length;
    const correctChances = getCorrectRarityChances(numTiers);
    const sortedRarities = [...collection.rarities].sort((a, b) => b.odds - a.odds);

    for (let i = 0; i < sortedRarities.length; i++) {
      const rarity = sortedRarities[i];
      const chanceData = correctChances[i];
      if (!chanceData) continue;

      const probability = chanceData.chance / 100;
      const skinAvgs = rarity.skins
        .map(skin => getWeightedAvgPrice(skin.marketHashNameBase, skin.wears))
        .filter(p => p !== null);

      if (skinAvgs.length > 0) {
        hasAnyPrice = true;
        const tierAvgPrice = skinAvgs.reduce((a, b) => a + b, 0) / skinAvgs.length;
        avgUnboxValue += probability * tierAvgPrice;
      }
    }

    if (!hasAnyPrice) return null;

    const cost = collection.costStars * STAR_COST_VND;
    const netAvgUnbox = includeFee ? avgUnboxValue / 1.15 : avgUnboxValue;
    const starROI = (netAvgUnbox / cost) * 100;

    // Profit % = probability of profitable unbox
    let profitProbability = 0;
    for (let i = 0; i < sortedRarities.length; i++) {
      const rarity = sortedRarities[i];
      const chanceData = correctChances[i];
      if (!chanceData) continue;

      const rarityProb = chanceData.chance / 100;
      const numSkinsInTier = rarity.skins.length;
      const skinProb = rarityProb / numSkinsInTier;

      for (const skin of rarity.skins) {
        const cached = skinPrices[skin.marketHashNameBase];
        if (!cached) continue;

        const isNormalOnly = skin.wears.includes('Normal') && skin.wears.length === 1;

        if (isNormalOnly) {
          const normalData = cached['Normal'];
          if (normalData && normalData.success && normalData.price && normalData.price > cost) {
            profitProbability += skinProb;
          }
        } else {
          for (const [wear, wearChancePct] of Object.entries(WEAR_CHANCES)) {
            if (!skin.wears.includes(wear)) continue;
            const wearData = cached[wear];
            if (wearData && wearData.success && wearData.price && wearData.price > cost) {
              const wearProb = wearChancePct / 100;
              profitProbability += skinProb * wearProb;
            }
          }
        }
      }
    }

    return {
      roi: starROI,
      profit: profitProbability * 100,
      avgValue: avgUnboxValue,
    };
  }, [skinPrices, getWeightedAvgPrice]);

  /**
   * Force flush pending cloud syncs.
   */
  const forceCloudSync = useCallback(() => {
    flushSyncQueue();
  }, [flushSyncQueue]);

  const clearCache = useCallback(() => {
    setSkinPrices({});
    localStorage.removeItem(CACHE_KEY);
  }, []);

  return {
    skinPrices,
    updatePrice,
    getPrice,
    hasPrice,
    getAvgPrice,
    getWeightedAvgPrice,
    getCollectionROI,
    clearCache,
    lastUpdated,
    markUpdated,
    cloudStatus,
    forceCloudSync,
  };
}
