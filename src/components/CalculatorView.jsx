import React, { useState, useMemo } from 'react';
import { Trash2, Plus, Edit2, Check, X } from 'lucide-react';
import { formatVND, getRoiColorClass } from '../utils/formatters';
import { STAR_COST_VND, DASHBOARD_ORDER } from '../utils/constants';

export default function CalculatorView({ 
  simulationsHook, 
  armoryCollections, 
  priceCache, 
  includeFee 
}) {
  const {
    simulations,
    activeSimulation,
    setActiveSimulationId,
    createSimulation,
    renameSimulation,
    deleteSimulation,
    setItemQuantity
  } = simulationsHook;

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  // Derived stats
  const stats = useMemo(() => {
    let totalItems = 0;
    let totalStars = 0;
    let expectedReturn = 0;

    if (activeSimulation && activeSimulation.items) {
      Object.entries(activeSimulation.items).forEach(([colId, qty]) => {
        const col = armoryCollections.find(c => c.id === colId);
        if (col && qty > 0) {
          totalItems += qty;
          totalStars += (col.costStars * qty);
          
          const roiData = priceCache.getCollectionROI(col, includeFee);
          if (roiData && roiData.avgValue) {
            expectedReturn += (roiData.avgValue * qty);
          }
        }
      });
    }

    const totalCost = totalStars * STAR_COST_VND;
    const profit = expectedReturn - totalCost;
    const roi = totalCost > 0 ? (expectedReturn / totalCost) * 100 : 0;

    return { totalItems, totalStars, totalCost, expectedReturn, profit, roi };
  }, [activeSimulation, armoryCollections, priceCache, includeFee]);

  if (!activeSimulation) return <div className="calc-loading">Loading...</div>;

  const startEditName = () => {
    setEditName(activeSimulation.name);
    setIsEditingName(true);
  };

  const saveEditName = () => {
    if (editName.trim() && editName !== activeSimulation.name) {
      renameSimulation(activeSimulation.id, editName.trim());
    }
    setIsEditingName(false);
  };

  const handleCreateNew = () => {
    const nextNum = simulations.length + 1;
    createSimulation(`Simulation ${nextNum}`);
  };

  const sortedCollections = [...armoryCollections].sort((a, b) => 
    (DASHBOARD_ORDER[a.id] ?? 99) - (DASHBOARD_ORDER[b.id] ?? 99)
  );

  const canAddMore = stats.totalItems < 200;

  return (
    <div className="calculator-view">
      <div className="calc-toolbar">
        <div className="calc-sim-selector">
          <select 
            value={activeSimulation.id} 
            onChange={(e) => setActiveSimulationId(e.target.value)}
          >
            {simulations.map(sim => (
              <option key={sim.id} value={sim.id}>{sim.name}</option>
            ))}
          </select>
          
          {isEditingName ? (
            <div className="calc-name-edit">
              <input 
                type="text" 
                value={editName} 
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveEditName()}
              />
              <button onClick={saveEditName} className="icon-btn green"><Check size={14}/></button>
              <button onClick={() => setIsEditingName(false)} className="icon-btn red"><X size={14}/></button>
            </div>
          ) : (
            <div className="calc-actions">
              <button onClick={startEditName} className="icon-btn" title="Rename"><Edit2 size={14}/></button>
              <button 
                onClick={() => deleteSimulation(activeSimulation.id)} 
                className="icon-btn red" 
                title="Delete"
                disabled={simulations.length <= 1}
              >
                <Trash2 size={14}/>
              </button>
            </div>
          )}
        </div>
        
        <button onClick={handleCreateNew} className="btn-primary">
          <Plus size={14} /> New Sim
        </button>
      </div>

      <div className="calc-grid">
        {sortedCollections.map(coll => {
          const qty = activeSimulation.items?.[coll.id] || 0;
          return (
            <div key={coll.id} className={`calc-item-card ${qty > 0 ? 'active' : ''}`}>
              <div className="calc-item-info">
                {coll.image && <img src={coll.image} alt={coll.name} />}
                <div className="calc-item-text">
                  <span className="name">{coll.name}</span>
                  <span className="cost">{coll.costStars} Stars</span>
                </div>
              </div>
              
              <div className="calc-qty-control">
                <button 
                  onClick={() => setItemQuantity(coll.id, qty - 1)}
                  disabled={qty <= 0}
                  className="qty-btn"
                >-</button>
                <input 
                  type="number" 
                  min="0" 
                  max="200"
                  value={qty === 0 ? '' : qty}
                  placeholder="0"
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setItemQuantity(coll.id, val);
                  }}
                />
                <button 
                  onClick={() => setItemQuantity(coll.id, qty + 1)}
                  disabled={!canAddMore}
                  className="qty-btn"
                >+</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="calc-summary-panel">
        <div className="summary-row">
          <div className="summary-stat">
            <span className="label">Items</span>
            <span className={`value ${stats.totalItems >= 200 ? 'roi-orange' : ''}`}>
              {stats.totalItems} / 200
            </span>
          </div>
          <div className="summary-stat">
            <span className="label">Total Cost</span>
            <span className="value">{formatVND(stats.totalCost)}</span>
          </div>
          <div className="summary-stat">
            <span className="label">Expected Return</span>
            <span className="value">{formatVND(stats.expectedReturn)}</span>
          </div>
        </div>
        <div className="summary-row main-result">
          <div className="summary-stat">
            <span className="label">Total ROI</span>
            <span className={`value ${getRoiColorClass(stats.totalCost > 0 ? stats.roi : null)}`}>
              {stats.totalCost > 0 ? `${stats.roi.toFixed(1)}%` : '—'}
            </span>
          </div>
          <div className="summary-stat">
            <span className="label">Expected Profit/Loss</span>
            <span className={`value ${stats.totalCost > 0 ? (stats.profit > 0 ? 'roi-green' : 'roi-red') : ''}`}>
              {stats.totalCost > 0 ? formatVND(stats.profit) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
