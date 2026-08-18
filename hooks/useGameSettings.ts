'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { GameSettings, DEFAULT_GAME_SETTINGS, getGameSettings } from '@/lib/gameSettings';

export type { GameSettings };

/**
 * React Hook for client components to subscribe to dynamic game settings in real-time.
 */
export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const configRef = doc(db, 'settings', 'game_config');
    const unsubscribe = onSnapshot(
      configRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setSettings({
            gameFeeAmount: typeof data.gameFeeAmount === 'number' ? data.gameFeeAmount : DEFAULT_GAME_SETTINGS.gameFeeAmount,
            minRwdRequired: typeof data.minRwdRequired === 'number' ? data.minRwdRequired : DEFAULT_GAME_SETTINGS.minRwdRequired,
            coinsPerToken: typeof data.coinsPerToken === 'number' && data.coinsPerToken > 0 ? data.coinsPerToken : DEFAULT_GAME_SETTINGS.coinsPerToken,
            minWithdrawCoins: typeof data.minWithdrawCoins === 'number' && data.minWithdrawCoins >= 0 ? data.minWithdrawCoins : DEFAULT_GAME_SETTINGS.minWithdrawCoins,
            leaderboardEnabled: data.leaderboardEnabled !== undefined ? Boolean(data.leaderboardEnabled) : DEFAULT_GAME_SETTINGS.leaderboardEnabled,
            startDate: data.startDate || '',
            endDate: data.endDate || '',
          });
        } else {
          // If doc doesn't exist, fetch from server fallback
          getGameSettings().then(setSettings);
        }
        setIsLoading(false);
      },
      (err) => {
        console.warn('Game settings listener warning:', err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { settings, isLoading };
}
