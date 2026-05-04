import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { armoryCollections } from '../data';
import { formatCurrency, getRoiColorClass } from '../utils/formatters';
import { DASHBOARD_ORDER } from '../utils/constants';

import { fetchItemPrice, onQueueStatus } from '../api';
import { syncPriceToCloud } from '../supabase';
import { useSimulations } from '../hooks/useSimulations';
import { useLoader } from '../contexts/LoaderContext';

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

export default function Dashboard({ includeFee, priceCache, activeCurrency }) {
  const { loadState, setLoadState, cooldown } = useLoader();
  const [loadingCollId, setLoadingCollId] = useState(null);
  
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'calculator' ? 'CALCULATOR' : 'RARITY VALUES';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab state with URL when navigating back/forward
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'calculator') setActiveTab('CALCULATOR');
    else if (activeTab === 'CALCULATOR') setActiveTab('RARITY VALUES');
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'CALCULATOR') setSearchParams({ tab: 'calculator' });
    else setSearchParams({});
  };

  const abortRef = useRef(false);

  const simulationsHook = useSimulations();

  const orderedCollections = DASHBOARD_ORDER
    .map(slug => armoryCollections.find(c => c.id === slug))
    .filter(Boolean);



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

    const codes = mode === 'all_currencies' ? [1, 15] : [activeCurrency === 'USD' ? 1 : 15];
    const totalOperations = itemsToLoad.length * codes.length;

    const startTime = Date.now();
    setLoadState({
      active: true,
      mode,
      current: 0,
      total: totalOperations,
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
        ...prev, 
        currentSkin: skin.name,
        currentWear: wear === 'Normal' ? '' : wear,
        currentCollection: collectionName,
      }));

      const wearParam = wear === 'Normal' ? '' : wear;
      
      for (const code of codes) {
        if (abortRef.current) break;
        
        const result = await fetchItemPrice(skin.marketHashNameBase, wearParam, code);
        
        // Update local cache only if it's the active currency
        const isActiveCode = (activeCurrency === 'USD' && code === 1) || (activeCurrency === 'VND' && code === 15);
        if (isActiveCode) {
          priceCache.updatePrice(skin.marketHashNameBase, wear, result);
        } else if (result.success) {
          // For non-active currency, we sync directly to cloud
          syncPriceToCloud(skin.marketHashNameBase, wear, result.price, result.volume, code);
        }


        fetched++;
        const elapsed = (Date.now() - startTime) / 1000;
        const avgPerItem = elapsed / fetched;
        const remaining = totalOperations - fetched;
        const eta = Math.round(avgPerItem * remaining);

        setLoadState(prev => ({ ...prev, current: fetched, etaSeconds: eta > 0 ? eta : null }));
      }
    }


    setLoadState({
      active: false, mode: null, current: 0, total: 0, skipped: 0,
      currentSkin: '', currentWear: '', currentCollection: '',
      startTime: null, etaSeconds: null,
    });
    setLoadingCollId(null);
  }, [loadState.active, orderedCollections, priceCache, activeCurrency]);

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
            <button 
              className={`tab ${activeTab === 'RARITY VALUES' ? 'active' : ''}`}
              onClick={() => handleTabChange('RARITY VALUES')}
            >
              <span className="tab-check">{activeTab === 'RARITY VALUES' ? '✓' : ''}</span>
              RARITY VALUES
            </button>
            <button 
              className={`tab ${activeTab === 'ITEMS WITHIN' ? 'active' : ''}`}
              onClick={() => handleTabChange('ITEMS WITHIN')}
            >
              <span className="tab-check">{activeTab === 'ITEMS WITHIN' ? '✓' : ''}</span>
              ITEMS WITHIN
            </button>
            <button 
              className={`tab ${activeTab === 'CALCULATOR' ? 'active' : ''}`}
              onClick={() => handleTabChange('CALCULATOR')}
            >
              <span className="tab-check">{activeTab === 'CALCULATOR' ? '✓' : ''}</span>
              CALCULATOR
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
            className={`reload-btn ${loadState.active && loadState.mode === 'all' ? 'loading' : ''}`}
            onClick={() => handleLoad('all')}
            disabled={loadState.active}
            title="Reload all prices for current currency"
          >
            <RefreshCw size={14} className={loadState.active && loadState.mode === 'all' ? 'spinning' : ''} />
            {loadState.active && loadState.mode === 'all' && !loadingCollId ? 'Reloading...' : 'Reload Prices'}
          </button>

          <button 
            className={`reload-btn ${loadState.active && loadState.mode === 'all_currencies' ? 'loading' : ''}`}
            onClick={() => handleLoad('all_currencies')}
            disabled={loadState.active}
            style={{ borderColor: 'var(--accent-yellow)', color: 'var(--accent-yellow)' }}
            title="Force reload all prices for both VND and USD"
          >
            <RefreshCw size={14} className={loadState.active && loadState.mode === 'all_currencies' ? 'spinning' : ''} />
            Reload All (VND/USD)
          </button>
        </div>
      </div>



      {activeTab === 'CALCULATOR' ? (
        <CalculatorView 
          simulationsHook={simulationsHook}
          armoryCollections={orderedCollections}
          priceCache={priceCache}
          includeFee={includeFee}
          activeCurrency={activeCurrency}
        />
      ) : (
        <div className="dashboard-grid">
          {orderedCollections.map((coll, index) => {
            const roiData = priceCache.getCollectionROI(coll, includeFee);
            const cost = coll.costStars * priceCache.starCost;

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
                  {coll.costStars} ★ / {formatCurrency(cost, activeCurrency)} → {avgValue ? formatCurrency(avgValue, activeCurrency) : '—'} AVG
                </span>

                <button
                  className={`card-reload-btn ${isThisLoading ? 'spinning' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleLoad('reload', coll);
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
      )}
    </main>
  );
}

