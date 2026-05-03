// === Formatting Utilities ===

/**
 * Format a number based on currency (VND or USD)
 */
export const formatCurrency = (amount, currencyType = 'VND') => {
  if (amount == null || isNaN(amount)) return 'N/A';
  if (currencyType === 'USD') {
    return '$' + Number(amount).toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }
  // Default VND
  return Math.round(Number(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
};

/**
 * Format a timestamp as relative time (e.g. "5 mins ago")
 */
export const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'Never';
  const diff = Date.now() - parseInt(timestamp);
  const mins = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (mins > 0) return `${mins} min${mins > 1 ? 's' : ''} ago`;
  return 'Just now';
};

/**
 * Calculate profit percentage
 * @param {number} price - Market price
 * @param {number} stars - Star count
 * @param {boolean} includeFee - Whether to subtract Steam's 15% fee
 * @param {number} starCost - Cost per star in active currency
 */
export const calculateProfit = (price, stars, includeFee, starCost) => {
  if (!price || price === 0 || !starCost) return 0;
  const cost = stars * starCost;
  const netPrice = includeFee ? price / 1.15 : price;
  return ((netPrice / cost) - 1) * 100;
};


/**
 * Build Steam Market URL for a specific item + wear
 */
export const getSteamMarketUrl = (marketHashNameBase, wear) => {
  if (!wear || wear === 'Normal') {
    return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashNameBase)}`;
  }
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(`${marketHashNameBase} (${wear})`)}`;
};

/**
 * Convert a display name to a URL-safe slug
 */
export const slugify = (name) => {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
};

/**
 * Determine ROI color class based on percentage.
 * >= 120% : orange
 * >= 100% : pink
 * < 100% : green
 */
export const getRoiColorClass = (roi) => {
  if (roi == null) return 'muted';
  if (roi >= 120) return 'roi-orange';
  if (roi >= 100) return 'roi-pink';
  return 'roi-green';
};
