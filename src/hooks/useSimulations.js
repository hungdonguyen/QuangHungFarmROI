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
      
      let data = await loadSimulations(userId);
      
      // Load joined simulations from localStorage
      let joinedIds = [];
      try {
        const stored = localStorage.getItem('csroi_joined_sims');
        if (stored) joinedIds = JSON.parse(stored);
      } catch (e) {
        // ignore
      }

      if (joinedIds.length > 0) {
        const joinedSims = await Promise.all(
          joinedIds.map(id => getSimulationById(id))
        );
        const validJoined = joinedSims.filter(sim => sim !== null);
        
        // Merge without duplicates
        const ownedIds = new Set(data.map(s => s.id));
        const newSims = [...data];
        validJoined.forEach(sim => {
          if (!ownedIds.has(sim.id)) {
            newSims.push(sim);
          }
        });
        data = newSims;
      }
      
      if (!isMounted) return;

      if (data && data.length > 0) {
        setSimulations(data);
        setActiveSimulationId(data[0].id);
      } else {
        // Do not auto-create simulation, just set empty
        setSimulations([]);
        setActiveSimulationId(null);
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
      
      // Save to localStorage
      try {
        const stored = localStorage.getItem('csroi_joined_sims');
        const joinedIds = stored ? JSON.parse(stored) : [];
        const newJoined = [...new Set([...joinedIds, sim.id])];
        localStorage.setItem('csroi_joined_sims', JSON.stringify(newJoined));
      } catch (e) {
        // ignore
      }
      
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
    const simToDelete = simulations.find(s => s.id === id);
    if (!simToDelete) return;

    if (simToDelete.user_id !== userId) {
      // It's a joined simulation, just remove from local state and localStorage
      setSimulations(prev => {
        const updated = prev.filter(s => s.id !== id);
        if (activeSimulationId === id && updated.length > 0) {
          setActiveSimulationId(updated[0].id);
        } else if (updated.length === 0) {
          setActiveSimulationId(null);
        }
        return updated;
      });
      try {
        const stored = localStorage.getItem('csroi_joined_sims');
        const joinedIds = stored ? JSON.parse(stored) : [];
        const newJoined = joinedIds.filter(jId => jId !== id);
        localStorage.setItem('csroi_joined_sims', JSON.stringify(newJoined));
      } catch (e) {
        // ignore
      }
      return;
    }

    // Owned simulation
    setSimulations(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (activeSimulationId === id && updated.length > 0) {
        setActiveSimulationId(updated[0].id);
      } else if (updated.length === 0) {
        setActiveSimulationId(null);
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
