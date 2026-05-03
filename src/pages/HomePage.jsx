import React from 'react';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';

export default function CollectionPage({ includeFee, setIncludeFee, activeCurrency, setActiveCurrency, lastUpdated, priceCache }) {
  return (
    <div className="app-container">
      <Sidebar
        lastUpdated={lastUpdated}
        includeFee={includeFee}
        setIncludeFee={setIncludeFee}
        activeCurrency={activeCurrency}
        setActiveCurrency={setActiveCurrency}
        priceCache={priceCache}
      />
      <Dashboard includeFee={includeFee} priceCache={priceCache} activeCurrency={activeCurrency} />
    </div>
  );
}
