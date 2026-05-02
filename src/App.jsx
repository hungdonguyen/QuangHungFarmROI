import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { usePriceCache } from './hooks/useLocalStorage';
import HomePage from './pages/HomePage';
import CollectionPage from './pages/CollectionPage';
import './App.css';

function App() {
  const [includeFee, setIncludeFee] = useState(false);
  const priceCache = usePriceCache();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              includeFee={includeFee}
              setIncludeFee={setIncludeFee}
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
              setIncludeFee={setIncludeFee}
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
