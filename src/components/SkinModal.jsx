import React, { useState, useEffect } from 'react';
import { WEAR_NAMES } from '../data';
import { fetchItemPrice } from '../api';
import { formatVND, getSteamMarketUrl } from '../utils/formatters';
import { WEAR_CHANCES } from '../utils/constants';
import { RefreshCw, ExternalLink } from 'lucide-react';

export default function SkinModal({ data, onClose, priceCache, includeFee }) {
  const { skin, color, collection } = data;
  const [loading, setLoading] = useState(false);
  const [prices, setPrices] = useState({});
  const [reloading, setReloading] = useState(false);

  const isNormalOnly = skin.wears.includes('Normal') && skin.wears.length === 1;
  const wearsToRender = isNormalOnly 
    ? { 'Normal': 100 } 
    : WEAR_CHANCES;

  // Check if any wear is missing price
  const hasMissingPrices = () => {
    const wears = isNormalOnly ? ['Normal'] : Object.keys(wearsToRender);
    return wears.some(wear => {
      if (!skin.wears.includes(wear)) return false;
      const p = prices[wear];
      return !p || p.price == null;
    });
  };

  useEffect(() => {
    // Load from cache first
    if (priceCache.hasPrice(skin.marketHashNameBase)) {
      setPrices(priceCache.getPrice(skin.marketHashNameBase));
      setLoading(false);
    } else {
      // No cache → auto-load
      loadPrices(false);
    }
  }, [skin.marketHashNameBase]);

  async function loadPrices(forceReload = false) {
    setLoading(true);
    setReloading(forceReload);

    const supportedWears = isNormalOnly
      ? ['Normal']
      : ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred'];

    const newPrices = { ...prices };

    for (const wear of supportedWears) {
      if (!skin.wears.includes(wear)) {
        newPrices[wear] = { price: null, volume: 0, success: false };
        continue;
      }

      // Skip if already cached and not force reloading
      if (!forceReload && newPrices[wear]?.price != null) continue;

      const wearParam = wear === 'Normal' ? '' : wear;
      const result = await fetchItemPrice(skin.marketHashNameBase, wearParam);
      
      newPrices[wear] = result;
      priceCache.updatePrice(skin.marketHashNameBase, wear, result);
      
      // Update prices progressively
      setPrices(prev => ({ ...prev, [wear]: result }));
    }
    
    setLoading(false);
    setReloading(false);
  }

  // Calculate WEIGHTED average price (same as CSROI.com)
  const computeWeightedAvg = () => {
    if (isNormalOnly) {
      const normalData = prices['Normal'];
      return normalData?.price || null;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const [wear, chancePct] of Object.entries(WEAR_CHANCES)) {
      if (!skin.wears.includes(wear)) continue;
      const wearData = prices[wear];
      if (wearData?.price) {
        const weight = chancePct / 100;
        weightedSum += wearData.price * weight;
        totalWeight += weight;
      }
    }

    if (totalWeight === 0) return null;
    return weightedSum / totalWeight;
  };

  const avgPrice = computeWeightedAvg();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ borderTopColor: color }} onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>✕</button>
        
        <div className="modal-header">
          <div className="modal-odds">1 in ?</div>
          <h2 className="modal-title">{skin.name}</h2>
          <div className="modal-avg">
            {avgPrice ? `${formatVND(avgPrice)} AVG` : 'AVG:'}
          </div>
        </div>

        <div className="modal-body">
          {skin.image && (
            <img src={skin.image} alt={skin.name} className="modal-skin-img" />
          )}
          
          <div className="chart-container">
            {Object.entries(wearsToRender).map(([wear, chance]) => (
              <div key={wear} className="chart-bar-wrapper">
                <span className="chart-bar-value">{chance.toFixed(2)}%</span>
                <div 
                  className="chart-bar" 
                  style={{ height: `${chance * 2}px`, backgroundColor: color }}
                />
              </div>
            ))}
          </div>

          <div className="chart-labels">
            {Object.entries(wearsToRender).map(([wear]) => {
              const priceData = prices[wear];
              const rawPrice = priceData?.price;
              const netPrice = rawPrice ? (includeFee ? rawPrice / 1.15 : rawPrice) : null;
              const marketUrl = getSteamMarketUrl(skin.marketHashNameBase, wear);
              
              return (
                <div key={wear} className="chart-label-item">
                  <span className="wear-name">{WEAR_NAMES[wear] || wear}</span>
                  {loading && !priceData ? (
                    <span className="wear-price loading">Loading...</span>
                  ) : (
                    <a 
                      href={marketUrl}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`wear-price ${netPrice ? 'has-price' : 'no-price'}`}
                      title={`Open ${skin.name} (${wear}) on Steam Market`}
                    >
                      {netPrice ? formatVND(netPrice) : '—'}
                      <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.6 }} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reload button for missing prices */}
          {!loading && hasMissingPrices() && (
            <button 
              className="reload-missing-btn"
              onClick={() => loadPrices(true)}
              disabled={reloading}
            >
              <RefreshCw size={14} className={reloading ? 'spinning' : ''} />
              Reload Missing Prices
            </button>
          )}

          {/* Steam Market link */}
          <a 
            href={getSteamMarketUrl(skin.marketHashNameBase, isNormalOnly ? 'Normal' : 'Factory New')}
            target="_blank" 
            rel="noopener noreferrer"
            className="steam-market-link"
          >
            <ExternalLink size={14} />
            Open on Steam Market
          </a>
        </div>
      </div>
    </div>
  );
}
