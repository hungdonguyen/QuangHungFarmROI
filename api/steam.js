/**
 * Vercel Serverless Function — Steam Market Price Proxy
 * 
 * Proxies requests to Steam Community Market API to avoid CORS.
 * Route: /api/steam?market_hash_name=...
 */
export default async function handler(req, res) {
  const { market_hash_name } = req.query;

  if (!market_hash_name) {
    return res.status(400).json({ error: 'market_hash_name is required' });
  }

  const steamUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=15&market_hash_name=${encodeURIComponent(market_hash_name)}`;

  try {
    const response = await fetch(steamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    // Forward 429 status to client so it can handle retry
    if (response.status === 429) {
      res.setHeader('Retry-After', response.headers.get('Retry-After') || '30');
      return res.status(429).json({ error: 'Rate limited by Steam' });
    }

    if (!response.ok) {
      return res.status(response.status).json({ error: `Steam API error: ${response.status}` });
    }

    const data = await response.json();

    // Cache for 5 minutes on Vercel Edge
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json(data);
  } catch (error) {
    console.error('Steam proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch from Steam' });
  }
}
