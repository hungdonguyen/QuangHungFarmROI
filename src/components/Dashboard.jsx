import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { armoryCollections } from '../data';
import { formatVND, getRoiColorClass } from '../utils/formatters';
import { DASHBOARD_ORDER, STAR_COST_VND } from '../utils/constants';
import { fetchItemPrice, onQueueStatus } from '../api';
import { useSimulations } from '../hooks/useSimulations';
import CalculatorView from './CalculatorView';

/**
 * Collect all (skin, wear) pairs from a list of collections.
 */
function collectAllSkinWears(collections) {
  const items = [];
  for (const coll of collections) {
    for (const rarity of coll.rarities) {
      for (const skin of rarity.skins) {
        const isNormalOnly = skin.wears.includes('Normal') && skin.wears.length === 1;
        const wears = isNormalOnly ? ['Normal'] : skin.wears;
        for (const wear of wears) {
          items.push({ skin, wear, collectionName: coll.name });
        }
      }
    }
  }
  return items;
}

export default function Dashboard({ includeFee, priceCache }) {
  const [loadState, setLoadState] = useState({
    active: false,
    mode: null,
    current: 0,
    total: 0,
    skipped: 0,
    currentSkin: '',
    currentWear: '',
    currentCollection: '',
    startTime: null,
    etaSeconds: null,
  });
  const [cooldown, setCooldown] = useState(null);
  const [loadingCollId, setLoadingCollId] = useState(null);
  const [activeTab, setActiveTab] = useState('RARITY VALUES');
  const abortRef = useRef(false);

  const simulationsHook = useSimulations();

  const orderedCollections = DASHBOARD_ORDER
    .map(slug => armoryCollections.find(c => c.id === slug))
    .filter(Boolean);

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

  /**
   * Load prices for a specific collection or all collections.
   */
  const handleLoad = useCallback(async (mode, targetCollection = null) => {
    if (loadState.active) return;
    abortRef.current = false;

    const collections = targetCollection ? [targetCollection] : orderedCollections;
    const allItems = collectAllSkinWears(collections);

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
      setLoadingCollId(null);
      return;
    }

    if (targetCollection) setLoadingCollId(targetCollection.id);

    const startTime = Date.now();
    setLoadState({
      active: true,
      mode,
      current: 0,
      total: itemsToLoad.length,
      skipped: 0,
      currentSkin: '',
      currentWear: '',
      currentCollection: targetCollection ? targetCollection.name : '',
      startTime,
      etaSeconds: null,
    });

    let fetched = 0;
    let skippedCount = 0;

    for (let i = 0; i < itemsToLoad.length; i++) {
      if (abortRef.current) break;

      const { skin, wear, collectionName } = itemsToLoad[i];

      setLoadState(prev => ({
        ...prev, current: i + 1,
        currentSkin: skin.name,
        currentWear: wear === 'Normal' ? '' : wear,
        currentCollection: collectionName,
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
      currentSkin: '', currentWear: '', currentCollection: '',
      startTime: null, etaSeconds: null,
    });
    setLoadingCollId(null);
  }, [loadState.active, orderedCollections, priceCache]);

  const formatEta = (seconds) => {
    if (!seconds || seconds <= 0) return '';
    if (seconds < 60) return `~${seconds}s left`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~${mins}m${secs > 0 ? ` ${secs}s` : ''} left`;
  };

  return (
    <main className="main-content" style={{ overflowY: 'auto' }}>
      <div className="header">
        <div className="header-left">
          <div className="header-tabs">
            <button className="tab active">
              <span className="tab-check">✓</span>
              RARITY VALUES
            </button>
            <button className="tab">
              <span className="tab-check"></span>
              ITEMS WITHIN
            </button>
          </div>
        </div>
        <div className="header-actions">
          <button
            className={`reload-btn ${loadState.active && loadState.mode === 'missing' ? 'loading' : ''}`}
            onClick={() => handleLoad('missing')}
            disabled={loadState.active}
            title="Only load prices that haven't been cached yet"
          >
            <Download size={14} />
            {loadState.active && loadState.mode === 'missing' && !loadingCollId ? 'Loading...' : 'Load Missing'}
          </button>
          <button
            className={`reload-btn ${loadState.active && loadState.mode === 'reload' && !loadingCollId ? 'loading' : ''}`}
            onClick={() => handleLoad('reload')}
            disabled={loadState.active}
            title="Reload all prices (skips already cached)"
          >
            <RefreshCw size={14} />
            {loadState.active && loadState.mode === 'reload' && !loadingCollId ? 'Reloading...' : 'Reload Prices'}
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
              <span className="load-progress-collection">{loadState.currentCollection}</span>
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

      {activeTab === 'CALCULATOR' ? (
        <CalculatorView 
          simulationsHook={simulationsHook}
          armoryCollections={orderedCollections}
          priceCache={priceCache}
          includeFee={includeFee}
        />
      ) : (
        <div className="dashboard-grid">
          {orderedCollections.map((coll, index) => {
            const roiData = priceCache.getCollectionROI(coll, includeFee);
            const cost = coll.costStars * STAR_COST_VND;
            const avgValue = roiData ? roiData.avgValue : null;
            const isThisLoading = loadingCollId === coll.id;

          return (
            <Link key={coll.id} to={`/${coll.id}`} className="dashboard-card">
              <div className="card-banner">
                <span className="card-title">{coll.name}</span>
                <span className="card-rank">#{index + 1}</span>
              </div>

              <div className="card-body">
                <div className="card-stats">
                  <div className="stat">
                    <span className="stat-label">Star ROI</span>
                    <span className={`stat-value ${getRoiColorClass(roiData ? roiData.roi : null)}`}>
                      {roiData ? `${roiData.roi.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Profit</span>
                    <span className={`stat-value ${roiData ? (roiData.profit > 0 ? 'roi-green' : 'roi-red') : 'muted'}`}>
                      {roiData ? `${roiData.profit.toFixed(2)}%` : '—'}
                    </span>
                  </div>
                </div>

                {coll.image && (
                  <img src={coll.image} alt={coll.name} className="card-image" />
                )}
              </div>

              <div className="card-footer">
                <span>
                  {coll.costStars} ★ / {formatVND(cost)} → {avgValue ? formatVND(avgValue) : '—'} AVG
                </span>
                <button
                  className={`card-reload-btn ${isThisLoading ? 'spinning' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleLoad('missing', coll);
                  }}
                  disabled={loadState.active}
                  title={`Reload ${coll.name}`}
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

