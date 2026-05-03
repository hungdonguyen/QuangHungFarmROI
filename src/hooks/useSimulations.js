import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  loadSimulations,
  createSimulation,
  updateSimulationItems,
  renameSimulation,
  deleteSimulation,
  getSimulationById
} from '../supabase';

export function useSimulations() {
  const [simulations, setSimulations] = useState([]);
  const [activeSimulationId, setActiveSimulationId] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Local UUID for anonymous user tracking
  // Stable userId for the lifetime of the component
  const [userId] = useState(() => {
    let uid = localStorage.getItem('csroi_user_id');
    if (!uid) {
      uid = uuidv4();
      localStorage.setItem('csroi_user_id', uid);
    }
    return uid;
  });

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

  const activeSimulation = useMemo(() => {
    return simulations.find(s => s.id === activeSimulationId) || simulations[0] || null;
  }, [simulations, activeSimulationId]);

  // Actions
  const handleCreateSimulation = async (name) => {
    const newSim = await createSimulation(userId, name);
    if (newSim) {
      setSimulations(prev => [...prev, newSim]);
      setActiveSimulationId(newSim.id);
    }
  };

  const handleJoinSimulation = async (id) => {
    // Check if already in list
    const exists = simulations.find(s => s.id === id);
    if (exists) {
      setActiveSimulationId(id);
      return true;
    }
    
    // Fetch from Supabase
    const sim = await getSimulationById(id);
    if (sim) {
      setSimulations(prev => [...prev, sim]);
      setActiveSimulationId(sim.id);
      return true;
    }
    return false;
  };

  const handleRenameSimulation = async (id, newName) => {
    // Optimistic update
    setSimulations(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
    await renameSimulation(id, newName);
  };

  const handleDeleteSimulation = async (id) => {
    // If it's the last one, don't delete (or create a new one instead)
    if (simulations.length <= 1) return;

    setSimulations(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (activeSimulationId === id && updated.length > 0) {
        setActiveSimulationId(updated[0].id);
      }
      return updated;
    });
    await deleteSimulation(id);
  };

  const setSimulationItems = (newItems) => {
    if (!activeSimulationId) return;

    setSimulations(prev => prev.map(sim => {
      if (sim.id !== activeSimulationId) return sim;

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
    joinSimulation: handleJoinSimulation,
    renameSimulation: handleRenameSimulation,
    deleteSimulation: handleDeleteSimulation,
    setSimulationItems
  };
}
