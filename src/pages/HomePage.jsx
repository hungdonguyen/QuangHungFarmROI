import React from 'react';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';

export default function HomePage({ includeFee, setIncludeFee, lastUpdated, priceCache }) {
  return (
    <div className="app-container">
      <Sidebar
        lastUpdated={lastUpdated}
        includeFee={includeFee}
        setIncludeFee={setIncludeFee}
        priceCache={priceCache}
      />
      <Dashboard includeFee={includeFee} priceCache={priceCache} />
    </div>
  );
}
