/**
 * Token Price Fetcher for $RWD on Solana Mainnet
 *
 * Pair / Token Address on DexScreener:
 * https://dexscreener.com/solana/HnfN7ZSaVQMKSKbz3pUdsmPuGkgAYAEnVq8pxsSH9Wow
 */

const MAINNET_RWD_PAIR = 'HnfN7ZSaVQMKSKbz3pUdsmPuGkgAYAEnVq8pxsSH9Wow';

let cachedPriceUsd: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 20_000; // 20 seconds cache

/**
 * Fetch live USD price of $RWD token from DexScreener with caching.
 */
export async function fetchRwdTokenPriceUsd(): Promise<number> {
  const now = Date.now();
  if (cachedPriceUsd !== null && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedPriceUsd;
  }

  try {
    // 1. Direct DexScreener Pair API
    const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${MAINNET_RWD_PAIR}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      const priceStr = data?.pair?.priceUsd;
      const parsed = parseFloat(priceStr);
      if (!isNaN(parsed) && parsed > 0) {
        cachedPriceUsd = parsed;
        lastFetchTime = now;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('DexScreener pair price fetch failed, trying search fallback...', err);
  }

  try {
    // 2. DexScreener Search Fallback
    const searchRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${MAINNET_RWD_PAIR}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const firstPair = searchData?.pairs?.[0];
      const parsed = parseFloat(firstPair?.priceUsd);
      if (!isNaN(parsed) && parsed > 0) {
        cachedPriceUsd = parsed;
        lastFetchTime = now;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('DexScreener search price fetch failed:', err);
  }

  return cachedPriceUsd || 0.00001; // Safe fallback price
}
