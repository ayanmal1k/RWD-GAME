/**
 * Centralized Game Settings & Economics System (Server & Shared)
 *
 * All parameters are stored in Firestore `settings/game_config` so the
 * Admin can update them dynamically in real-time without redeployment:
 *
 * 1. gameFeeAmount: Starting fee in $RWD tokens (default: 10)
 * 2. minRwdRequired: Minimum $RWD token balance required to play/withdraw (default: 0)
 * 3. coinsPerToken: Exchange rate (coins needed per 1 $RWD token, default: 10)
 * 4. minWithdrawCoins: Minimum coins threshold to withdraw (default: 1000)
 * 5. leaderboardEnabled: Whether leaderboard is active (default: true)
 * 6. startDate: Leaderboard contest start date
 * 7. endDate: Leaderboard contest end date
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export interface GameSettings {
  gameFeeAmount: number;
  minRwdRequired: number;       // Devnet: raw token balance required
  minRwdUsdRequired: number;    // Mainnet: minimum USD value required (e.g. $10)
  coinsPerToken: number;
  minWithdrawCoins: number;
  leaderboardEnabled: boolean;
  startDate: string;
  endDate: string;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  gameFeeAmount: Number(process.env.GAME_FEE_AMOUNT || process.env.NEXT_PUBLIC_GAME_FEE_AMOUNT || 10),
  minRwdRequired: Number(process.env.NEXT_PUBLIC_MIN_RWD_REQUIRED ?? process.env.NEXT_PUBLIC_MIN_REAL_REQUIRED ?? 0),
  minRwdUsdRequired: Number(process.env.NEXT_PUBLIC_MIN_RWD_USD_REQUIRED ?? 10),
  coinsPerToken: 10,
  minWithdrawCoins: 1000,
  leaderboardEnabled: true,
  startDate: '',
  endDate: '',
};

/**
 * Server-side & shared helper to fetch dynamic game settings from Firestore with fallback defaults.
 */
export async function getGameSettings(): Promise<GameSettings> {
  try {
    const configRef = doc(db, 'settings', 'game_config');
    const snap = await getDoc(configRef);

    if (snap.exists()) {
      const data = snap.data();
      return {
        gameFeeAmount: typeof data.gameFeeAmount === 'number' ? data.gameFeeAmount : DEFAULT_GAME_SETTINGS.gameFeeAmount,
        minRwdRequired: typeof data.minRwdRequired === 'number' ? data.minRwdRequired : DEFAULT_GAME_SETTINGS.minRwdRequired,
        minRwdUsdRequired: typeof data.minRwdUsdRequired === 'number' ? data.minRwdUsdRequired : DEFAULT_GAME_SETTINGS.minRwdUsdRequired,
        coinsPerToken: typeof data.coinsPerToken === 'number' && data.coinsPerToken > 0 ? data.coinsPerToken : DEFAULT_GAME_SETTINGS.coinsPerToken,
        minWithdrawCoins: typeof data.minWithdrawCoins === 'number' && data.minWithdrawCoins >= 0 ? data.minWithdrawCoins : DEFAULT_GAME_SETTINGS.minWithdrawCoins,
        leaderboardEnabled: data.leaderboardEnabled !== undefined ? Boolean(data.leaderboardEnabled) : DEFAULT_GAME_SETTINGS.leaderboardEnabled,
        startDate: data.startDate || '',
        endDate: data.endDate || '',
      };
    }

    // Fallback: Check if old settings/leaderboard exists and migrate
    const lbRef = doc(db, 'settings', 'leaderboard');
    const lbSnap = await getDoc(lbRef);
    let migratedSettings = { ...DEFAULT_GAME_SETTINGS };

    if (lbSnap.exists()) {
      const lbData = lbSnap.data();
      migratedSettings.leaderboardEnabled = lbData.enabled !== undefined ? Boolean(lbData.enabled) : true;
      migratedSettings.startDate = lbData.startDate || '';
      migratedSettings.endDate = lbData.endDate || '';
    }

    // Initialize document in Firestore
    try {
      await setDoc(configRef, {
        ...migratedSettings,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Quietly ignore if write fails
    }

    return migratedSettings;
  } catch (err) {
    console.error('Error loading game settings from Firestore:', err);
    return DEFAULT_GAME_SETTINGS;
  }
}
