import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  loadSimulations,
  createSimulation,
  updateSimulationItems,
  renameSimulation,
  deleteSimulation
} from '../supabase';

export function useSimulations() {
  const [simulations, setSimulations] = useState([]);
  const [activeSimulationId, setActiveSimulationId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Local UUID for anonymous user tracking
  const getUserId = () => {
    let uid = localStorage.getItem('csroi_user_id');
    if (!uid) {
      uid = uuidv4();
      localStorage.setItem('csroi_user_id', uid);
    }
    return uid;
  };

  const userId = getUserId();
  const syncTimeoutRef = useRef({});

  // Initial load
  useEffect(() => {
    let isMounted = true;
    
    async function init() {
      setLoading(true);
      const data = await loadSimulations(userId);
      
      if (!isMounted) return;

      if (data && data.length > 0) {
        setSimulations(data);
        setActiveSimulationId(data[0].id);
      } else {
        // Create default simulation if none exist
        const defaultSim = await createSimulation(userId, 'Simulation 1');
        if (defaultSim && isMounted) {
          setSimulations([defaultSim]);
          setActiveSimulationId(defaultSim.id);
        }
      }
      setLoading(false);
    }

    init();

    return () => { isMounted = false; };
  }, [userId]);

  const activeSimulation = simulations.find(s => s.id === activeSimulationId) || null;

  // Actions
  const handleCreateSimulation = async (name) => {
    const newSim = await createSimulation(userId, name);
    if (newSim) {
      setSimulations(prev => [...prev, newSim]);
      setActiveSimulationId(newSim.id);
    }
  };

  const handleRenameSimulation = async (id, newName) => {
    // Optimistic update
    setSimulations(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
    await renameSimulation(id, newName);
  };

  const handleDeleteSimulation = async (id) => {
    // If it's the last one, don't delete (or create a new one instead)
    if (simulations.length <= 1) return;

    setSimulations(prev => prev.filter(s => s.id !== id));
    if (activeSimulationId === id) {
      const remaining = simulations.filter(s => s.id !== id);
      if (remaining.length > 0) setActiveSimulationId(remaining[0].id);
    }
    await deleteSimulation(id);
  };

  const setItemQuantity = (collectionId, qty) => {
    if (!activeSimulationId) return;

    setSimulations(prev => prev.map(sim => {
      if (sim.id !== activeSimulationId) return sim;
      
      const newItems = { ...sim.items };
      
      // Enforce 200 items max logic here
      let currentTotal = 0;
      Object.entries(newItems).forEach(([cId, q]) => {
        if (cId !== collectionId) currentTotal += q;
      });

      // Calculate allowed quantity to not exceed 200
      let safeQty = qty;
      if (currentTotal + safeQty > 200) {
        safeQty = 200 - currentTotal;
      }
      if (safeQty < 0) safeQty = 0;

      if (safeQty <= 0) {
        delete newItems[collectionId];
      } else {
        newItems[collectionId] = safeQty;
      }

      // Debounce the save to Supabase
      if (syncTimeoutRef.current[sim.id]) {
        clearTimeout(syncTimeoutRef.current[sim.id]);
      }
      syncTimeoutRef.current[sim.id] = setTimeout(() => {
        updateSimulationItems(sim.id, newItems);
      }, 1000);

      return { ...sim, items: newItems };
    }));
  };

  return {
    simulations,
    activeSimulationId,
    activeSimulation,
    setActiveSimulationId,
    loading,
    createSimulation: handleCreateSimulation,
    renameSimulation: handleRenameSimulation,
    deleteSimulation: handleDeleteSimulation,
    setItemQuantity
  };
}
