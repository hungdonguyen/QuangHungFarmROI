import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { armoryCollections } from '../data';
import Sidebar from '../components/Sidebar';
import CollectionDetail from '../components/CollectionDetail';
import SkinModal from '../components/SkinModal';

export default function CollectionPage({ includeFee, setIncludeFee, lastUpdated, priceCache }) {
  const { id } = useParams();
  const collection = armoryCollections.find(c => c.id === id);
  const [selectedSkin, setSelectedSkin] = useState(null);

  return (
    <div className="app-container">
      <Sidebar
        lastUpdated={lastUpdated}
        includeFee={includeFee}
        setIncludeFee={setIncludeFee}
        collection={collection}
        priceCache={priceCache}
      />
      <CollectionDetail
        onSelectSkin={setSelectedSkin}
        priceCache={priceCache}
        includeFee={includeFee}
      />

      {selectedSkin && (
        <SkinModal
          data={selectedSkin}
          onClose={() => setSelectedSkin(null)}
          priceCache={priceCache}
          includeFee={includeFee}
        />
      )}
    </div>
  );
}
