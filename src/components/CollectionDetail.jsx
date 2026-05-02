import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { armoryCollections } from '../data';
import { formatVND } from '../utils/formatters';
import { STAR_COST_VND, getCorrectRarityChances } from '../utils/constants';
import { fetchItemPrice, onQueueStatus } from '../api';

function collectSkinWears(collection) {
  const items = [];
  for (const rarity of collection.rarities) {
    for (const skin of rarity.skins) {
      const isNormalOnly = skin.wears.includes('Normal') && skin.wears.length === 1;
      const wears = isNormalOnly ? ['Normal'] : skin.wears;
      for (const wear of wears) {
        items.push({ skin, wear, rarityName: rarity.name });
      }
    }
  }
  return items;
}

export default function CollectionDetail({ onSelectSkin, priceCache, includeFee }) {
  const { id } = useParams();
  const collection = armoryCollections.find(c => c.id === id);
  const [activeTab, setActiveTab] = useState('rarity');
  const [sortBy, setSortBy] = useState('price');
  const [activeRarities, setActiveRarities] = useState(new Set());
  const [cooldown, setCooldown] = useState(null);

  const [loadState, setLoadState] = useState({
    active: false, mode: null, current: 0, total: 0, skipped: 0,
    currentSkin: '', currentWear: '', currentRarity: '',
    startTime: null, etaSeconds: null,
  });
  const abortRef = useRef(false);

  // Subscribe to queue status (429 cooldowns)
  useEffect(() => {
    const unsub = onQueueStatus((status) => {
      if (status.type === 'cooldown') {
        setCooldown(status);
      } else if (status.type === 'resumed') {
        setCooldown(null);
      }
    });
    return unsub;
  }, []);

  const handleLoad = useCallback(async (mode) => {
    if (loadState.active || !collection) return;
    abortRef.current = false;

    const allItems = collectSkinWears(collection);

    let itemsToLoad;
    if (mode === 'missing') {
      itemsToLoad = allItems.filter(({ skin, wear }) => {
        const cached = priceCache.getPrice(skin.marketHashNameBase);
        return !cached[wear] || !cached[wear].success;
      });
    } else {
      itemsToLoad = allItems;
    }

    if (itemsToLoad.length === 0) {
      setLoadState(prev => ({ ...prev, active: false, mode: null }));
      return;
    }

    const startTime = Date.now();
    setLoadState({
      active: true, mode, current: 0, total: itemsToLoad.length, skipped: 0,
      currentSkin: '', currentWear: '', currentRarity: '',
      startTime, etaSeconds: null,
    });

    let fetched = 0;
    let skippedCount = 0;

    for (let i = 0; i < itemsToLoad.length; i++) {
      if (abortRef.current) break;

      const { skin, wear, rarityName } = itemsToLoad[i];

      if (mode === 'reload') {
        const cached = priceCache.getPrice(skin.marketHashNameBase);
        if (cached[wear] && cached[wear].success) {
          skippedCount++;
          setLoadState(prev => ({
            ...prev, current: i + 1, skipped: skippedCount,
            currentSkin: skin.name, currentWear: wear, currentRarity: rarityName,
          }));
          continue;
        }
      }

      setLoadState(prev => ({
        ...prev, current: i + 1,
        currentSkin: skin.name,
        currentWear: wear === 'Normal' ? '' : wear,
        currentRarity: rarityName,
      }));

      const wearParam = wear === 'Normal' ? '' : wear;
      const result = await fetchItemPrice(skin.marketHashNameBase, wearParam);
      priceCache.updatePrice(skin.marketHashNameBase, wear, result);
      fetched++;

      const elapsed = (Date.now() - startTime) / 1000;
      const avgPerItem = elapsed / fetched;
      const remaining = itemsToLoad.length - i - 1;
      const remainingToFetch = mode === 'missing'
        ? remaining
        : Math.max(0, remaining - Math.round(skippedCount * (remaining / (i + 1))));
      const eta = Math.round(avgPerItem * remainingToFetch);

      setLoadState(prev => ({ ...prev, etaSeconds: eta > 0 ? eta : null }));
    }

    setLoadState({
      active: false, mode: null, current: 0, total: 0, skipped: 0,
      currentSkin: '', currentWear: '', currentRarity: '',
      startTime: null, etaSeconds: null,
    });
  }, [loadState.active, collection, priceCache]);

  const formatEta = (seconds) => {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `~${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m${secs > 0 ? ` ${secs}s` : ''} left`;
  };

  if (!collection) {
    return (
      <main className="main-content">
        <div style={{ padding: 40, color: '#8892a4', textAlign: 'center' }}>
          <h2>Collection not found</h2>
          <p>No data available for "{id}"</p>
        </div>
      </main>
    );
  }

  const toggleRarity = (rarityId) => {
    setActiveRarities(prev => {
      const next = new Set(prev);
      if (next.has(rarityId)) next.delete(rarityId);
      else next.add(rarityId);
      return next;
    });
  };

  const getAllItems = () => {
    let items = [];
    for (const rarity of collection.rarities) {
      for (const skin of rarity.skins) {
        if (activeRarities.size > 0 && !activeRarities.has(rarity.id)) continue;
        const avgPrice = priceCache?.getWeightedAvgPrice(skin.marketHashNameBase, skin.wears);
        items.push({ skin, rarity, avgPrice });
      }
    }
    if (sortBy === 'price') items.sort((a, b) => (b.avgPrice || 0) - (a.avgPrice || 0));
    else if (sortBy === 'name') items.sort((a, b) => a.skin.name.localeCompare(b.skin.name));
    return items;
  };

  return (
    <main className="main-content">
      <div className="header">
        <div className="header-left">
          <div className="header-tabs">
            <button className={`tab ${activeTab === 'rarity' ? 'active' : ''}`} onClick={() => setActiveTab('rarity')}>
              <span className="tab-check">{activeTab === 'rarity' ? '✓' : ''}</span>
              RARITY VALUES
            </button>
            <button className={`tab ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>
              <span className="tab-check">{activeTab === 'items' ? '✓' : ''}</span>
              ITEMS WITHIN
            </button>
          </div>
        </div>
        <div className="header-actions">
          <button
            className={`reload-btn ${loadState.active && loadState.mode === 'missing' ? 'loading' : ''}`}
            onClick={() => handleLoad('missing')}
            disabled={loadState.active}
            title="Only load prices not yet cached"
          >
            <Download size={14} />
            {loadState.active && loadState.mode === 'missing' ? 'Loading...' : 'Load Missing'}
          </button>
          <button
            className={`reload-btn ${loadState.active && loadState.mode === 'reload' ? 'loading' : ''}`}
            onClick={() => handleLoad('reload')}
            disabled={loadState.active}
            title="Reload all prices (skips already cached)"
          >
            <RefreshCw size={14} />
            {loadState.active && loadState.mode === 'reload' ? 'Reloading...' : 'Reload Prices'}
          </button>
        </div>
      </div>

      {/* Loading progress bar */}
      {loadState.active && (
        <div className="load-progress-bar">
          <div className="load-progress-info">
            <div className="load-progress-main">
              <span className="load-progress-count">
                {loadState.current}/{loadState.total}
                {loadState.skipped > 0 && (
                  <span className="load-progress-skipped"> ({loadState.skipped} cached)</span>
                )}
              </span>
              <span className="load-progress-eta">{formatEta(loadState.etaSeconds)}</span>
            </div>
            <div className="load-progress-detail">
              <span className="load-progress-rarity">{loadState.currentRarity}</span>
              {loadState.currentSkin && (
                <>
                  <span className="load-progress-separator">›</span>
                  <span className="load-progress-skin">{loadState.currentSkin}</span>
                </>
              )}
              {loadState.currentWear && (
                <span className="load-progress-wear">({loadState.currentWear})</span>
              )}
            </div>
          </div>

          {/* 429 Cooldown warning */}
          {cooldown && cooldown.seconds > 0 && (
            <div className="load-cooldown-warning">
              <AlertTriangle size={14} />
              <span>
                Rate limited (429) — cooling down {cooldown.seconds}s
                {cooldown.retry && ` (retry ${cooldown.retry}/${cooldown.maxRetries})`}
              </span>
            </div>
          )}

          <div className="load-progress-track">
            <div
              className="load-progress-fill"
              style={{ width: `${(loadState.current / loadState.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {activeTab === 'rarity' ? (
        <div className="rarity-grid">
          {(() => {
            const numTiers = collection.rarities.length;
            const correctChances = getCorrectRarityChances(numTiers);
            // CS2 rarity order: rarest (left) → most common (right)
            // Gold > Red > Pink > Purple > Dark Blue > Light Blue > White
            const RARITY_ORDER = {
              '#e4ae39': 0, // Extraordinary (gold)
              '#eb4b4b': 1, // Covert (red)
              '#d32ce6': 2, // Classified (pink)
              '#8847ff': 3, // Restricted (purple)
              '#4b69ff': 4, // Mil-Spec Grade (dark blue)
              '#5e98d9': 5, // Industrial Grade (light blue)
              '#b0c3d9': 6, // Consumer Grade (white/grey)
            };
            const sortedRarities = [...collection.rarities].sort((a, b) => {
              const orderA = RARITY_ORDER[a.color] ?? 99;
              const orderB = RARITY_ORDER[b.color] ?? 99;
              return orderA - orderB;
            });
            return sortedRarities.map((rarity, idx) => {
              const chanceData = correctChances[idx];
              // Sort skins within rarity by price (highest first)
              const sortedSkins = [...rarity.skins].sort((a, b) => {
                const priceA = priceCache?.getWeightedAvgPrice(a.marketHashNameBase, a.wears) || 0;
                const priceB = priceCache?.getWeightedAvgPrice(b.marketHashNameBase, b.wears) || 0;
                return priceB - priceA;
              });
              return (
                <div className="rarity-column" key={rarity.id}>
                  <div className="rarity-header" style={{
                    background: `linear-gradient(180deg, ${rarity.color} 0%, ${rarity.color}44 100%)`
                  }}>
                    <span className="rarity-chance">{chanceData ? chanceData.chance.toFixed(1) : rarity.chance}%</span>
                    <span className="rarity-odds">1 in {chanceData ? chanceData.odds : rarity.odds}</span>
                  </div>
                  <div className="rarity-items">
                    {sortedSkins.map(skin => {
                      const avgPrice = priceCache?.getWeightedAvgPrice(skin.marketHashNameBase, skin.wears);
                      return (
                        <button key={skin.id} className="skin-card"
                          onClick={() => onSelectSkin({ skin, color: rarity.color, collection })}>
                          {skin.image && <img src={skin.image} alt={skin.name} />}
                          <span className="skin-name">{skin.name}</span>
                          <span className="skin-avg-label">AVG:</span>
                          <span className="skin-avg-price">{avgPrice ? formatVND(avgPrice) : '—'}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        <>
          <div className="items-within-header">
            <div className="sort-dropdown">
              <label>Sort By</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="price">PRICE</option>
                <option value="name">NAME</option>
              </select>
            </div>
            <div className="rarity-filters">
              <label>Rarity:</label>
              {collection.rarities.map(r => (
                <div key={r.id}
                  className={`rarity-dot ${activeRarities.size === 0 || activeRarities.has(r.id) ? 'active' : ''}`}
                  style={{ backgroundColor: r.color }}
                  onClick={() => toggleRarity(r.id)}
                  title={r.name}
                />
              ))}
            </div>
          </div>
          <div className="items-grid">
            {getAllItems().map(({ skin, rarity, avgPrice }) => (
              <button key={skin.id} className="item-card"
                onClick={() => onSelectSkin({ skin, color: rarity.color, collection })}>
                <span className="item-odds" style={{ backgroundColor: rarity.color + '33', color: rarity.color }}>
                  1 in {rarity.odds}
                </span>
                {skin.image && <img src={skin.image} alt={skin.name} />}
                <span className="item-name">{skin.name}</span>
                <span className="item-price">{avgPrice ? formatVND(avgPrice) : '—'}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
