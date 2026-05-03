import axios from 'axios';

/**
 * Steam API endpoint:
 * - Development: Vite dev proxy → /api/steam/market/priceoverview/
 * - Production:  Vercel serverless function → /api/steam
 */
const isDev = import.meta.env.DEV;

/**
 * Rate-limited request queue with 429 backoff handling.
 * 
 * - Minimum delay between requests: 4s (safe for Steam API)
 * - On 429: exponential backoff starting at 30s, max 120s
 * - Max retries per request: 5
 */
class RequestQueue {
    constructor(baseDelayMs = 4000) {
        this.queue = [];
        this.isProcessing = false;
        this.baseDelayMs = baseDelayMs;
        this.currentDelayMs = baseDelayMs;
        this.cache = new Map();
        this.consecutive429s = 0;
        this.onStatusChange = null;
    }

    async add(url, currency = 15) {
        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        return new Promise((resolve, reject) => {
            this.queue.push({ url, currency, resolve, reject, retries: 0 });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;
        const item = this.queue.shift();
        const { url, currency, resolve, reject, retries } = item;
        const MAX_RETRIES = 5;

        try {
            let apiUrl;
            if (isDev) {
                // Vite dev proxy
                apiUrl = `/api/steam/market/priceoverview/?appid=730&currency=${currency}&market_hash_name=${encodeURIComponent(url)}`;
            } else {
                // Vercel serverless function
                apiUrl = `/api/steam?market_hash_name=${encodeURIComponent(url)}&currency=${currency}`;
            }

            const response = await axios.get(apiUrl);
            let data = response.data;

            if (data && data.success) {
                this.cache.set(url, data);
                this.consecutive429s = 0;
                this.currentDelayMs = this.baseDelayMs;
                resolve(data);
            } else {
                reject(new Error("Failed to fetch or item not found"));
            }
        } catch (error) {
            const status = error?.response?.status;

            if (status === 429) {
                this.consecutive429s++;
                
                const backoffMs = Math.min(
                    30000 * this.consecutive429s,
                    120000
                );

                this.currentDelayMs = Math.min(
                    this.baseDelayMs + (1000 * this.consecutive429s),
                    8000
                );

                if (retries < MAX_RETRIES) {
                    console.warn(
                        `[429] Rate limited on "${url}". ` +
                        `Retry ${retries + 1}/${MAX_RETRIES} after ${backoffMs / 1000}s cooldown. ` +
                        `New delay: ${this.currentDelayMs}ms`
                    );

                    if (this.onStatusChange) {
                        this.onStatusChange({
                            type: 'cooldown',
                            seconds: Math.ceil(backoffMs / 1000),
                            item: url,
                            retry: retries + 1,
                            maxRetries: MAX_RETRIES,
                        });
                    }

                    await this._countdown(backoffMs);

                    if (this.onStatusChange) {
                        this.onStatusChange({ type: 'resumed' });
                    }

                    this.queue.unshift({ url, currency, resolve, reject, retries: retries + 1 });
                } else {
                    console.error(`[429] Max retries exceeded for "${url}"`);
                    reject(new Error(`Rate limited: max retries exceeded for ${url}`));
                }
            } else {
                reject(error);
            }
        }

        // Always wait at least baseDelay between requests
        await new Promise(r => setTimeout(r, this.currentDelayMs));
        this.processQueue();
    }

    async _countdown(totalMs) {
        const intervalMs = 1000;
        let remaining = totalMs;

        while (remaining > 0) {
            await new Promise(r => setTimeout(r, Math.min(intervalMs, remaining)));
            remaining -= intervalMs;

            if (this.onStatusChange && remaining > 0) {
                this.onStatusChange({
                    type: 'cooldown',
                    seconds: Math.ceil(remaining / 1000),
                });
            }
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

// Queue with 4s minimum delay between requests (Steam rate limit safe)
const queue = new RequestQueue(4000);

/**
 * Subscribe to queue status changes (cooldowns, etc.)
 * Returns unsubscribe function.
 */
export function onQueueStatus(callback) {
    queue.onStatusChange = callback;
    return () => { queue.onStatusChange = null; };
}

export async function fetchItemPrice(marketHashNameBase, wear, currency = 15) {
    let fullHashName = marketHashNameBase;
    if (wear) {
        fullHashName = `${marketHashNameBase} (${wear})`;
    }
    
    try {
        const data = await queue.add(fullHashName, currency);
        
        let price = null;
        if (data.lowest_price) {
            if (currency === 1) { // USD
                // Keep the decimal point for USD
                const cleaned = data.lowest_price.replace(/[^\d.]/g, '');
                price = parseFloat(cleaned);
            } else {
                // Remove everything but digits for VND
                price = parseInt(data.lowest_price.replace(/[^\d]/g, ''));
            }
        }

        return {
            price,
            volume: data.volume ? parseInt(data.volume.replace(/,/g, '')) : 0,
            success: price !== null
        };
    } catch (e) {

        console.warn(`Failed to fetch ${fullHashName}`, e);
        return {
            price: null,
            volume: 0,
            success: false,
            mocked: false
        };
    }
}

