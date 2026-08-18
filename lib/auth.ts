/**
 * Server-side authentication & session utilities.
 *
 * - HMAC-based session token generation and verification
 * - Auth cookie parsing for wallet ownership
 * - Constant-time comparison for HMAC tokens
 * - Solana network, treasury wallet, and RWD mint configuration (server-authoritative)
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Server-only configuration (never NEXT_PUBLIC_*)
// ---------------------------------------------------------------------------

const SESSION_SECRET = process.env.GAME_SESSION_SECRET || '';
if (!SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[FATAL] GAME_SESSION_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

/** Server-authoritative game fee amount (token units, not raw lamports). */
export const GAME_FEE_AMOUNT = Number(process.env.GAME_FEE_AMOUNT || 10);

/**
 * Server-authoritative treasury wallet that receives game fees.
 * Same address for both devnet and mainnet.
 */
export function getTreasuryWallet(): string {
  return process.env.GAME_FEE_WALLET || '';
}

/** Get the current Solana network identifier. */
export function getSolanaNetwork(): string {
  return SOLANA_NETWORK;
}

/**
 * Server-authoritative RWD token mint (contract address) for the current network.
 * Different CA on devnet vs mainnet.
 */
export function getRwdMint(): string {
  if (SOLANA_NETWORK === 'mainnet' || SOLANA_NETWORK === 'mainnet-beta') {
    return process.env.RWD_MINT_MAINNET || '';
  }
  return process.env.RWD_MINT_DEVNET || '';
}

// ---------------------------------------------------------------------------
// Hard game-specific reward caps (server-authoritative)
// ---------------------------------------------------------------------------

/** Maximum score achievable per second of gameplay. */
export const MAX_SCORE_PER_SEC = 120;

/** Maximum coins collectible per second of gameplay. */
export const MAX_COINS_PER_SEC = 3.0;

/** Absolute maximum score for any single game session regardless of duration. */
export const MAX_SCORE_PER_GAME = 50_000;

/** Absolute maximum coins for any single game session regardless of duration. */
export const MAX_COINS_PER_GAME = 500;

/** Minimum plausible game duration in seconds to have any score. */
export const MIN_GAME_DURATION_SEC = 2;

/**
 * Calculate the server-verified coin reward.
 * The server decides the reward — the client's claimed value is an upper bound.
 */
export function calculateVerifiedReward(
  claimedScore: number,
  claimedCoins: number,
  durationSeconds: number
): { verifiedScore: number; verifiedCoins: number; flagReason: string | null } {
  let flagReason: string | null = null;

  // Hard caps
  const maxScoreForDuration = Math.min(MAX_SCORE_PER_SEC * durationSeconds, MAX_SCORE_PER_GAME);
  const maxCoinsForDuration = Math.min(MAX_COINS_PER_SEC * durationSeconds, MAX_COINS_PER_GAME);

  if (claimedScore > 0 && durationSeconds < MIN_GAME_DURATION_SEC) {
    flagReason = `Impossible run time (${durationSeconds}s for score ${claimedScore})`;
    return { verifiedScore: 0, verifiedCoins: 0, flagReason };
  }

  if (claimedScore > maxScoreForDuration) {
    flagReason = `Score exceeds maximum (${claimedScore} > ${maxScoreForDuration} for ${durationSeconds}s)`;
    return { verifiedScore: 0, verifiedCoins: 0, flagReason };
  }

  if (claimedCoins > maxCoinsForDuration) {
    flagReason = `Coins exceed maximum (${claimedCoins} > ${Math.round(maxCoinsForDuration)} for ${durationSeconds}s)`;
    return { verifiedScore: 0, verifiedCoins: 0, flagReason };
  }

  if (claimedScore / durationSeconds > MAX_SCORE_PER_SEC) {
    flagReason = `Score rate exceeded (${(claimedScore / durationSeconds).toFixed(1)} pts/sec > ${MAX_SCORE_PER_SEC} max)`;
    return { verifiedScore: 0, verifiedCoins: 0, flagReason };
  }

  if (claimedCoins / durationSeconds > MAX_COINS_PER_SEC) {
    flagReason = `Coin rate exceeded (${(claimedCoins / durationSeconds).toFixed(1)} coins/sec > ${MAX_COINS_PER_SEC} max)`;
    return { verifiedScore: 0, verifiedCoins: 0, flagReason };
  }

  // Server caps the reward — never blindly trust the client value
  const verifiedScore = Math.min(claimedScore, maxScoreForDuration);
  const verifiedCoins = Math.min(claimedCoins, Math.floor(maxCoinsForDuration));

  return { verifiedScore, verifiedCoins, flagReason: null };
}

// ---------------------------------------------------------------------------
// HMAC Session Tokens
// ---------------------------------------------------------------------------

/** Session expiry duration in milliseconds (30 minutes). */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Create an HMAC-signed game session token.
 * Binds the session to a specific user and expiry time.
 *
 * Payload: `sessionId:userAddress:expiresAt`
 *
 * The token is NOT stored in Firestore — the server reconstructs it from
 * sessionId + userAddress + expiresAt + GAME_SESSION_SECRET.
 */
export function createSessionToken(
  sessionId: string,
  userAddress: string,
  expiresAt: number
): string {
  const payload = `${sessionId}:${userAddress}:${expiresAt}`;
  return crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Verify an HMAC session token using constant-time comparison.
 * Returns true if the token matches the expected HMAC for the given parameters.
 */
export function verifySessionToken(
  token: string,
  sessionId: string,
  userAddress: string,
  expiresAt: number
): boolean {
  const expected = createSessionToken(sessionId, userAddress, expiresAt);
  if (token.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth Cookie (wallet ownership proof)
// ---------------------------------------------------------------------------

const AUTH_COOKIE_NAME = 'rwd_auth';
const AUTH_COOKIE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a signed auth cookie value.
 * Format: `walletAddress:issuedAt:expiresAt:hmac`
 */
export function createAuthCookieValue(walletAddress: string): string {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + AUTH_COOKIE_TTL_MS;
  const payload = `${walletAddress}:${issuedAt}:${expiresAt}`;
  const hmac = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}:${hmac}`;
}

/**
 * Parse and verify an auth cookie.
 * Returns the authenticated wallet address or null if invalid/expired.
 */
export function parseAuthCookie(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split(':');
  if (parts.length !== 4) return null;

  const [walletAddress, issuedAtStr, expiresAtStr, providedHmac] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);

  // Check expiry
  if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

  // Verify HMAC
  const payload = `${walletAddress}:${issuedAtStr}:${expiresAtStr}`;
  const expectedHmac = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');

  if (providedHmac.length !== expectedHmac.length) return null;
  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(providedHmac, 'hex'),
      Buffer.from(expectedHmac, 'hex')
    );
    return valid ? walletAddress : null;
  } catch {
    return null;
  }
}

/**
 * Extract the auth cookie from a Request object's Cookie header.
 */
export function getAuthenticatedWallet(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!match) return null;
  const value = decodeURIComponent(match.substring(AUTH_COOKIE_NAME.length + 1));
  return parseAuthCookie(value);
}

/** Cookie name for external use. */
export { AUTH_COOKIE_NAME };
