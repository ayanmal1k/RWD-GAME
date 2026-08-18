/**
 * Server-side authentication & session utilities.
 *
 * - HMAC-based session token generation and verification
 * - Auth cookie parsing for wallet ownership
 * - Constant-time comparison for HMAC tokens
 * - Solana network & treasury wallet configuration (server-authoritative)
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

/** Server-authoritative treasury wallet for the current network. */
export function getTreasuryWallet(): string {
  if (SOLANA_NETWORK === 'mainnet' || SOLANA_NETWORK === 'mainnet-beta') {
    return process.env.GAME_FEE_WALLET_MAINNET || '';
  }
  return process.env.GAME_FEE_WALLET_DEVNET || '';
}

/** Get the current Solana network identifier. */
export function getSolanaNetwork(): string {
  return SOLANA_NETWORK;
}

/** RWD token mint address (server-authoritative). */
export function getRwdMint(): string {
  return (
    process.env.REAL_TOKEN_MINT_ADDRESS ||
    process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS ||
    process.env.RWD_TOKEN_MINT_ADDRESS ||
    process.env.NEXT_PUBLIC_RWD_TOKEN_ADDRESS ||
    ''
  );
}

// ---------------------------------------------------------------------------
// HMAC Session Tokens
// ---------------------------------------------------------------------------

/** Session expiry duration in milliseconds (30 minutes). */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Create an HMAC-signed game session token.
 * The token binds the session to a specific user and expiry time.
 *
 * Payload: `sessionId:userAddress:expiresAt`
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
