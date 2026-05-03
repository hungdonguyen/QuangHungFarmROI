import React, { useState, useMemo, useEffect } from 'react';
import { Trash2, Plus, Edit2, Check, X, Copy, Camera, History } from 'lucide-react';
import { formatCurrency, getRoiColorClass } from '../utils/formatters';
import { saveSnapshot, getSimulationById } from '../supabase';

import { DASHBOARD_ORDER } from '../utils/constants';

export default function CalculatorView({ 
  simulationsHook, 
  armoryCollections, 
  priceCache, 
  includeFee,
  activeCurrency
}) {

  const {
    simulations,
    activeSimulation,
    setActiveSimulationId,
    createSimulation,
    renameSimulation,
    deleteSimulation,
    setSimulationItems,
    joinSimulation
  } = simulationsHook;

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshotHistory, setSnapshotHistory] = useState([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);

  // Add Form State
  const sortedCollections = useMemo(() => {
    return [...armoryCollections].sort((a, b) => 
      (DASHBOARD_ORDER[a.id] ?? 99) - (DASHBOARD_ORDER[b.id] ?? 99)
    );
  }, [armoryCollections]);

  const [selectedColId, setSelectedColId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('random');
  const [addQty, setAddQty] = useState(1);

  useEffect(() => {
    if (!selectedColId && sortedCollections.length > 0) {
      setSelectedColId(sortedCollections[0].id);
    }
  }, [sortedCollections, selectedColId]);

  const activeCol = useMemo(() => 
    armoryCollections.find(c => c.id === selectedColId), 
  [armoryCollections, selectedColId]);

  const productsOptions = useMemo(() => {
    if (!activeCol) return [];
    const list = [{ value: 'random', label: 'Random Unbox (Average Return)' }];
    
    activeCol.rarities.forEach(r => {
      r.skins.forEach(skin => {
        const isNormalOnly = skin.wears.includes('Normal') && skin.wears.length === 1;
        const wears = isNormalOnly ? ['Normal'] : skin.wears;
        wears.forEach(wear => {
          const skinData = priceCache.getPrice(skin.marketHashNameBase);
          const wearData = skinData ? skinData[wear] : null;
          const rawPrice = wearData && wearData.success ? wearData.price : 0;
          
          const feeMultiplier = includeFee ? 0.85 : 1;
          const price = rawPrice ? rawPrice * feeMultiplier : 0;
          
          list.push({
            value: `${skin.id}|${wear}`,
            label: `${skin.name} (${wear}) - ${formatCurrency(price, activeCurrency)}`,


          });
        });
      });
    });
    return list;
  }, [activeCol, priceCache, includeFee]);

  // Derived stats
  const stats = useMemo(() => {
    let totalItems = 0;
    let totalStars = 0;
    let expectedReturn = 0;
    const parsedItems = [];

    if (activeSimulation && activeSimulation.items) {
      Object.entries(activeSimulation.items).forEach(([key, qty]) => {
        if (qty <= 0) return;
        const parts = key.split('|');
        const colId = parts[0];
        const col = armoryCollections.find(c => c.id === colId);
        if (!col) return;

        totalItems += qty;
        totalStars += (col.costStars * qty);
        
        if (parts.length === 1) {
          const roiData = priceCache.getCollectionROI(col, includeFee);
          const avgValue = roiData ? roiData.avgValue : 0;
          expectedReturn += (avgValue * qty);
          parsedItems.push({
            key, col, qty, 
            name: `Random ${col.name}`,
            wear: 'Average',
            rarityColor: '#fff',
            image: col.image,
            unitCost: col.costStars * priceCache.starCost,

            unitReturn: avgValue,
            cost: col.costStars * qty * priceCache.starCost,

            returnValue: avgValue * qty,
            isRandom: true
          });
        } else {
          const skinId = parts[1];
          const wear = parts[2];
          
          let skinObj = null;
          let rarityColor = '#fff';
          col.rarities.forEach(r => {
            const s = r.skins.find(x => x.id === skinId);
            if (s) { skinObj = s; rarityColor = r.color; }
          });
          
          if (skinObj) {
            const skinData = priceCache.getPrice(skinObj.marketHashNameBase);
            const wearData = skinData ? skinData[wear] : null;
            const rawPrice = wearData && wearData.success ? wearData.price : 0;
            
            const feeMultiplier = includeFee ? 0.85 : 1;
            const itemValue = rawPrice ? rawPrice * feeMultiplier : 0;
            expectedReturn += (itemValue * qty);
            
            parsedItems.push({
              key, col, qty,
              name: skinObj.name,
              wear: wear === 'Normal' ? 'Default' : wear,
              rarityColor,
              image: skinObj.image,
              unitCost: col.costStars * priceCache.starCost,
              unitReturn: itemValue,
              cost: col.costStars * qty * priceCache.starCost,
              returnValue: itemValue * qty,
              isRandom: false
            });
          }
        }
      });
    }

    const totalCost = totalStars * priceCache.starCost;
    const profit = expectedReturn - totalCost;
    const roi = totalCost > 0 ? (expectedReturn / totalCost) * 100 : 0;

    return { totalItems, totalStars, totalCost, expectedReturn, profit, roi, parsedItems };
  }, [activeSimulation, armoryCollections, priceCache, includeFee]);

  if (simulationsHook.loading) return <div className="calc-loading">Loading simulations...</div>;
  if (!activeSimulation) return (
    <div className="calc-loading" style={{ color: 'var(--accent-red)' }}>
      Database connection error! Please setup the `simulations` table in Supabase via SQL.
    </div>
  );

  const handleAddClick = async () => {
    const input = window.prompt("Enter Simulation ID to join, or leave empty/Cancel to create new:");
    if (input === null) return; 
    if (input.trim() === '') {
      await createSimulation(`Simulation ${simulations.length + 1}`);
    } else {
      const success = await joinSimulation(input.trim());
      if (!success) {
        alert("Simulation with this ID not found!");
      }
    }
  };

  const handleSaveSnapshot = async () => {
    const snapshotData = {
      timestamp: new Date().toISOString(),
      totalStars: stats.totalStars,
      totalCost: stats.totalCost,
      expectedReturn: stats.expectedReturn,
      profit: stats.profit,
      items: stats.parsedItems,
      currency: activeCurrency
    };
    const success = await saveSnapshot(activeSimulation.id, snapshotData);
    if (success) {
      alert("Snapshot saved successfully!");
    } else {
      alert("Error saving snapshot!");
    }
  };

  const openSnapshots = async () => {
    setShowSnapshots(true);
    setLoadingSnapshots(true);
    const sim = await getSimulationById(activeSimulation.id);
    if (sim && sim.snapshots) {
      // Sort newest first
      setSnapshotHistory([...sim.snapshots].reverse());
    } else {
      setSnapshotHistory([]);
    }
    setLoadingSnapshots(false);
  };

  const handleAdd = () => {
    if (!activeCol || addQty <= 0) return;
    const key = selectedProduct === 'random' 
      ? activeCol.id 
      : `${activeCol.id}|${selectedProduct}`;
    
    const currentItems = { ...activeSimulation.items };
    
    const newStars = activeCol.costStars * addQty;
    let safeQty = addQty;
    if (stats.totalStars + newStars > 200) {
      safeQty = Math.floor((200 - stats.totalStars) / activeCol.costStars);
    }
    
    if (safeQty > 0) {
      currentItems[key] = (currentItems[key] || 0) + safeQty;
      setSimulationItems(currentItems);
    }
    setAddQty(1);
    setSelectedProduct('random');
  };

  const updateItemQty = (key, delta, colCostStars) => {
    const currentItems = { ...activeSimulation.items };
    const currentQty = currentItems[key] || 0;
    let newQty = currentQty + delta;
    
    if (delta > 0) {
      if (stats.totalStars + colCostStars > 200) return;
    }

    if (newQty <= 0) {
      delete currentItems[key];
    } else {
      currentItems[key] = newQty;
    }
    setSimulationItems(currentItems);
  };

  const removeItem = (key) => {
    const currentItems = { ...activeSimulation.items };
    delete currentItems[key];
    setSimulationItems(currentItems);
  };

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

  return (
    <div className="calculator-view">
      <div className="calc-toolbar">
        <div className="calc-sim-tabs">
          {simulations.map(sim => (
            <button 
              key={sim.id} 
              className={`sim-tab ${activeSimulation.id === sim.id ? 'active' : ''}`}
              onClick={() => setActiveSimulationId(sim.id)}
            >
              {sim.name}
            </button>
          ))}
          
          <button onClick={handleAddClick} className="add-sim-btn" title="Add or Join Simulation">
            <Plus size={16} />
          </button>
        </div>
        
        <div className="calc-sim-actions">
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
            <>
              <button onClick={startEditName} className="icon-btn" title="Rename"><Edit2 size={14}/></button>
              <button 
                onClick={() => deleteSimulation(activeSimulation.id)} 
                className="icon-btn red" 
                title="Delete"
                disabled={simulations.length <= 1}
              >
                <Trash2 size={14}/>
              </button>
              <div className="sim-id-display">
                <span>ID: {activeSimulation.id}</span>
                <button 
                  className="icon-btn" 
                  onClick={() => {
                    navigator.clipboard.writeText(activeSimulation.id);
                    alert("ID copied to clipboard!");
                  }} 
                  title="Copy ID"
                >
                  <Copy size={12}/>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="calc-add-form">
        <select 
          value={selectedColId} 
          onChange={(e) => {
            setSelectedColId(e.target.value);
            setSelectedProduct('random');
          }}
          className="col-select"
        >
          {sortedCollections.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.costStars} ★)</option>
          ))}
        </select>

        <select 
          value={selectedProduct} 
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="product-select"
        >
          {productsOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <div className="qty-input-group">
          <input 
            type="number" 
            min="1" 
            max="100" 
            value={addQty} 
            onChange={(e) => setAddQty(parseInt(e.target.value) || 1)}
            title="Quantity"
          />
        </div>

        <button 
          onClick={handleAdd} 
          className="btn-primary add-btn"
          disabled={!activeCol || (stats.totalStars + (activeCol?.costStars * addQty)) > 200}
        >
          Add Item
        </button>
      </div>

      <div className="calc-table-container">
        <table className="calc-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Wear</th>
              <th>Qty</th>
              <th>Cost (★)</th>
              <th>Price</th>
              <th>Total Value</th>
              <th>Profit</th>
              <th>Actions</th>


            </tr>
          </thead>
          <tbody>
              {stats.parsedItems.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-state">No items added to this simulation yet.</td>
                </tr>

            ) : (
              stats.parsedItems.map(item => {
                const profit = item.returnValue - item.cost;
                return (
                  <tr key={item.key}>
                    <td>
                      <div className="table-item-cell">
                        <img src={item.image} alt={item.name} />
                        <span style={{ color: item.rarityColor, fontWeight: 500 }}>{item.name}</span>
                      </div>
                    </td>
                    <td className="wear-cell">{item.wear}</td>
                    <td>
                      <div className="table-qty">
                        <button onClick={() => updateItemQty(item.key, -1, item.col.costStars)}>-</button>
                        <span>{item.qty}</span>
                        <button 
                          onClick={() => updateItemQty(item.key, 1, item.col.costStars)}
                          disabled={stats.totalStars + item.col.costStars > 200}
                        >+</button>
                      </div>
                    </td>
                    <td>{item.qty * item.col.costStars} ★</td>
                    <td>{formatCurrency(item.unitReturn, activeCurrency)}</td>
                    <td>{formatCurrency(item.returnValue, activeCurrency)}</td>


                    <td className={profit > 0 ? 'roi-green' : profit < 0 ? 'roi-red' : ''}>
                      {profit > 0 ? '+' : ''}{formatCurrency(profit, activeCurrency)}
                    </td>

                    <td>
                      <button className="icon-btn red" onClick={() => removeItem(item.key)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="calc-summary-panel">
        <div className="summary-row">
          <div className="summary-stat">
            <span className="label">Total Stars</span>
            <span className={`value ${stats.totalStars >= 200 ? 'roi-orange' : ''}`}>
              {stats.totalStars} / 200 ★
            </span>
          </div>
          <div className="summary-stat">
            <span className="label">Total Cost</span>
            <span className="value">{formatCurrency(stats.totalCost, activeCurrency)}</span>

          </div>
          <div className="summary-stat">
            <span className="label">Expected Return</span>
            <span className="value">{formatCurrency(stats.expectedReturn, activeCurrency)}</span>

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
              {stats.totalCost > 0 ? formatCurrency(stats.profit, activeCurrency) : '—'}

            </span>
          </div>
        </div>
        <div className="summary-row main-result" style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
          <div className="summary-stat" style={{ flexDirection: 'row', gap: 12 }}>
            <button className="snapshot-history-btn" onClick={openSnapshots} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <History size={16} /> Snapshot History
            </button>
            <button className="snapshot-save-btn" onClick={handleSaveSnapshot} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Camera size={16} /> Save Snapshot
            </button>
          </div>
        </div>
      </div>
      {showSnapshots && (
        <div className="modal-overlay" onClick={() => setShowSnapshots(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>Snapshot History</h3>
              <button className="icon-btn" onClick={() => setShowSnapshots(false)}><X size={20}/></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {loadingSnapshots ? (
                <div style={{ textAlign: 'center', padding: 20 }}>Loading...</div>
              ) : snapshotHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>No snapshots saved yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {snapshotHistory.map((snap, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-card)', padding: 12, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }}>
                        <strong style={{ color: '#818cf8' }}>{new Date(snap.timestamp).toLocaleString()}</strong>
                        <span className={snap.profit > 0 ? 'roi-green' : 'roi-red'} style={{ fontWeight: 'bold' }}>
                          Profit: {formatCurrency(snap.profit, snap.currency || activeCurrency)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        <span>Stars: {snap.totalStars}/200</span>
                        <span>Cost: {formatCurrency(snap.totalCost, snap.currency || activeCurrency)}</span>
                        <span>Return: {formatCurrency(snap.expectedReturn, snap.currency || activeCurrency)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {snap.items && snap.items.map((item, i) => (
                          <div key={i} title={`${item.name} (${item.qty}x)`} style={{ position: 'relative' }}>
                            <img src={item.image} alt={item.name} style={{ width: 32, height: 24, objectFit: 'contain' }} />
                            <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: 9, background: '#111', padding: '0 4px', borderRadius: 4, border: `1px solid ${item.rarityColor}` }}>x{item.qty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
