'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchRealTokenBalance, MIN_REAL_REQUIRED } from '@/lib/solana';
import { useGameSettings } from '@/hooks/useGameSettings';

export function useRealTokenBalance(address: string | null | undefined, customMinRequired?: number) {
  const { settings } = useGameSettings();
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveMinRequired = typeof customMinRequired === 'number'
    ? customMinRequired
    : (settings?.minRwdRequired ?? MIN_REAL_REQUIRED);

  const checkBalance = useCallback(async () => {
    if (!address) {
      setRealBalance(null);
      setIsCheckingBalance(false);
      return;
    }

    setIsCheckingBalance(true);
    setError(null);
    try {
      const balance = await fetchRealTokenBalance(address);
      setRealBalance(balance);
    } catch (err: any) {
      console.error('Failed checking token balance:', err);
      setError(err?.message || 'Failed to fetch $REAL token balance');
      setRealBalance(0);
    } finally {
      setIsCheckingBalance(false);
    }
  }, [address]);

  useEffect(() => {
    checkBalance();
  }, [checkBalance]);

  const isEligible = (realBalance ?? 0) >= effectiveMinRequired;

  return {
    realBalance,
    isCheckingBalance,
    isEligible,
    error,
    refetchBalance: checkBalance,
    MIN_REAL_REQUIRED: effectiveMinRequired,
  };
}
