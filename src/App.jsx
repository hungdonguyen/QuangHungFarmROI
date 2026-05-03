import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { usePriceCache } from './hooks/useLocalStorage';
import HomePage from './pages/HomePage';
import CollectionPage from './pages/CollectionPage';
import './App.css';

function App() {
  const [includeFee, setIncludeFee] = useState(() => {
    return localStorage.getItem('csroi_includeFee') === 'true';
  });
  
  const [activeCurrency, setActiveCurrency] = useState(() => {
    return localStorage.getItem('csroi_currency') || 'VND';
  });

  const currencyCode = activeCurrency === 'USD' ? 1 : 15;
  const priceCache = usePriceCache(currencyCode);

  const toggleFee = (val) => {
    setIncludeFee(val);
    localStorage.setItem('csroi_includeFee', val);
  };

  const toggleCurrency = (val) => {
    setActiveCurrency(val);
    localStorage.setItem('csroi_currency', val);
  };


  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              includeFee={includeFee}
              setIncludeFee={toggleFee}
              activeCurrency={activeCurrency}
              setActiveCurrency={toggleCurrency}
              lastUpdated={priceCache.lastUpdated}
              priceCache={priceCache}
            />

          }
        />
        <Route
          path="/:id"
          element={
            <CollectionPage
              includeFee={includeFee}
              setIncludeFee={toggleFee}
              activeCurrency={activeCurrency}
              setActiveCurrency={toggleCurrency}
              lastUpdated={priceCache.lastUpdated}
              priceCache={priceCache}
            />

          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
