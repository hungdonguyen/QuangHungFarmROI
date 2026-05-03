import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { formatCurrency, formatTimeAgo, getRoiColorClass } from '../utils/formatters';
import { getCorrectRarityChances } from '../utils/constants';


export default function Sidebar({ 
  lastUpdated, 
  includeFee, 
  setIncludeFee, 
  activeCurrency, 
  setActiveCurrency, 
  collection, 
  priceCache 
}) {

  const navigate = useNavigate();

  const roiData = collection && priceCache ? priceCache.getCollectionROI(collection, includeFee) : null;

  const cloudStatusIcon = () => {
    switch (priceCache.cloudStatus) {
      case 'loading': return <Loader2 size={12} className="spinning" />;
      case 'synced': return <Cloud size={12} />;
      case 'error': return <CloudOff size={12} />;
      case 'disabled': return <CloudOff size={12} />;
      default: return <Cloud size={12} />;
    }
  };

  const cloudStatusText = () => {
    switch (priceCache.cloudStatus) {
      case 'loading': return 'Syncing...';
      case 'synced': return 'Cloud synced';
      case 'error': return 'Cloud error';
      case 'disabled': return 'Local only';
      default: return 'Cloud idle';
    }
  };

  return (
    <aside className="sidebar">
      <Link to="/" className="logo">
        <img src="/logo.png" alt="HungChikaFarm ROI" className="logo-img" />
      </Link>

      {collection ? (
        <>
          <button className="back-btn" onClick={() => navigate('/')}>
            <ChevronLeft size={14} /> Về Dashboard
          </button>
          <div className="collection-info">
            <span className="armory-badge">ARMORY</span>
            {collection.image && (
              <img src={collection.image} alt={collection.name} />
            )}
            <h3>{collection.name}</h3>
            <p className="collection-meta">
              {formatCurrency(collection.costStars * priceCache.starCost, activeCurrency)}<br/>

              {collection.costStars} Stars
            </p>

            {roiData && (
              <div className="sidebar-roi-stats">
                <div className="sidebar-roi-stat">
                  <span className="label">Unboxing ROI</span>
                  <span className={`value ${getRoiColorClass(roiData.roi)}`}>
                    {roiData.roi.toFixed(1)}%
                  </span>
                </div>
                <div className="sidebar-roi-stat">
                  <span className="label">Profit</span>
                  <span className={`value ${roiData.profit > 0 ? 'roi-green' : 'roi-red'}`}>
                    {roiData.profit.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Rarity breakdown bars */}
          <div className="rarity-bars">
            {(() => {
              const numTiers = collection.rarities.length;
              const correctChances = getCorrectRarityChances(numTiers);
              const RARITY_ORDER = {
                '#e4ae39': 0, '#eb4b4b': 1, '#d32ce6': 2, '#8847ff': 3,
                '#4b69ff': 4, '#5e98d9': 5, '#b0c3d9': 6,
              };
              const sortedRarities = [...collection.rarities].sort((a, b) =>
                (RARITY_ORDER[a.color] ?? 99) - (RARITY_ORDER[b.color] ?? 99)
              );
              return sortedRarities.map((rarity, idx) => {
                const chanceData = correctChances[idx];
                const avgPrices = rarity.skins
                  .map(s => priceCache?.getWeightedAvgPrice(s.marketHashNameBase, s.wears))
                  .filter(p => p !== null);
                const tierAvg = avgPrices.length > 0
                  ? avgPrices.reduce((a, b) => a + b, 0) / avgPrices.length
                  : null;
                const displayOdds = chanceData ? chanceData.odds : rarity.odds;

                return (
                  <div className="rarity-bar-row" key={rarity.id}>
                    <span className="rarity-bar-name" style={{ color: rarity.color }}>
                      {rarity.name}
                    </span>
                    <span className="rarity-bar-value">
                      {tierAvg ? `${formatCurrency(tierAvg, activeCurrency)}` : '—'} every {displayOdds}
                    </span>
                    <div
                      className="rarity-bar-line"
                      style={{
                        backgroundColor: rarity.color,
                        width: `${Math.min(100, (chanceData ? chanceData.chance : (1/rarity.odds) * 100) * 1.2)}%`
                      }}
                    />
                  </div>
                );
              });
            })()}
          </div>

          {roiData && (
            <div className="average-unbox">
              <span className="label">Average Unbox</span><br/>
              <span className="value">{formatVND(roiData.avgValue)}</span>
            </div>
          )}
        </>
      ) : (
        <div className="sidebar-nav">
          <Link 
            to="/" 
            className={location.pathname === '/' && !location.search.includes('tab=calculator') ? 'active' : ''}
          >
            Armory
          </Link>
          <Link 
            to="/?tab=calculator" 
            className={location.search.includes('tab=calculator') ? 'active' : ''}
          >
            Calculator
          </Link>
        </div>
      )}

      <div className="sidebar-fee">
        <label className="fee-toggle">
          <input
            type="checkbox"
            checked={includeFee}
            onChange={(e) => setIncludeFee(e.target.checked)}
          />
          Steam Fee (15%)
        </label>
      </div>

      <div className="sidebar-footer">
        <p>Pricing Source: <strong>Steam</strong></p>
        <div className="currency-selector">
          <button 
            className={activeCurrency === 'VND' ? 'active' : ''} 
            onClick={() => setActiveCurrency('VND')}
          >VND</button>
          <button 
            className={activeCurrency === 'USD' ? 'active' : ''} 
            onClick={() => setActiveCurrency('USD')}
          >USD</button>
        </div>

        <p className={`cloud-status cloud-${priceCache.cloudStatus}`}>
          {cloudStatusIcon()} {cloudStatusText()}
        </p>
        <p className="last-updated">
          Updated<br/>{formatTimeAgo(lastUpdated)}
        </p>
      </div>
    </aside>
  );
}
