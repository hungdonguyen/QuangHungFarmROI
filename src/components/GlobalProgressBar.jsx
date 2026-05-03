import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLoader } from '../contexts/LoaderContext';

const formatEta = (seconds) => {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s left`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `~${mins}m${secs > 0 ? ` ${secs}s` : ''} left`;
};

export default function GlobalProgressBar() {
  const { loadState, cooldown } = useLoader();

  if (!loadState.active) return null;

  return (
    <div className="global-load-progress-bar">
      <div className="load-progress-info">
        <div className="load-progress-main">
          <span className="load-progress-count">
            {loadState.current}/{loadState.total}
            {loadState.skipped > 0 && (
              <span className="load-progress-skipped"> ({loadState.skipped} cached)</span>
            )}
          </span>
          <span className="load-progress-eta">{formatEta(loadState.etaSeconds)}</span>
        </div>
        <div className="load-progress-detail">
          <span className="load-progress-collection">
            {loadState.currentCollection || loadState.currentRarity}
          </span>
          {loadState.currentSkin && (
            <>
              <span className="load-progress-separator">›</span>
              <span className="load-progress-skin">{loadState.currentSkin}</span>
            </>
          )}
          {loadState.currentWear && (
            <span className="load-progress-wear">({loadState.currentWear})</span>
          )}
        </div>
      </div>

      {cooldown && cooldown.seconds > 0 && (
        <div className="load-cooldown-warning">
          <AlertTriangle size={14} />
          <span>
            Rate limited (429) — cooling down {cooldown.seconds}s
            {cooldown.retry && ` (retry ${cooldown.retry}/${cooldown.maxRetries})`}
          </span>
        </div>
      )}

      <div className="load-progress-track">
        <div
          className="load-progress-fill"
          style={{ width: `${(loadState.current / loadState.total) * 100}%` }}
        />
      </div>
    </div>
  );
}
