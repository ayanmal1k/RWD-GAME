'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchRealTokenBalance, MIN_REAL_REQUIRED } from '@/lib/solana';
import { useGameSettings } from '@/hooks/useGameSettings';
import { fetchRwdTokenPriceUsd } from '@/lib/tokenPrice';

export function useRealTokenBalance(address: string | null | undefined, customMinRequired?: number) {
  const { settings } = useGameSettings();
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [tokenPriceUsd, setTokenPriceUsd] = useState<number>(0);
  const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const solanaNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const isMainnet = solanaNetwork === 'mainnet' || solanaNetwork === 'mainnet-beta';

  const rawThreshold = typeof customMinRequired === 'number'
    ? customMinRequired
    : (settings?.minRwdRequired ?? 10);

  const checkBalance = useCallback(async () => {
    if (!address) {
      setRealBalance(null);
      setIsCheckingBalance(false);
      return;
    }

    setIsCheckingBalance(true);
    setError(null);
    try {
      // Fetch token balance from chain and live price concurrently
      const [balance, price] = await Promise.all([
        fetchRealTokenBalance(address),
        isMainnet ? fetchRwdTokenPriceUsd() : Promise.resolve(0),
      ]);

      setRealBalance(balance);
      if (price > 0) {
        setTokenPriceUsd(price);
      }
    } catch (err: any) {
      console.error('Failed checking token balance / price:', err);
      setError(err?.message || 'Failed to fetch $RWD token balance');
      setRealBalance(0);
    } finally {
      setIsCheckingBalance(false);
    }
  }, [address, isMainnet]);

  useEffect(() => {
    checkBalance();
  }, [checkBalance]);

  // Compute USD Value of user balance
  const userBalanceUsd = (realBalance ?? 0) * tokenPriceUsd;

  // Determine eligibility based on active network:
  // Mainnet: User USD worth of $RWD >= rawThreshold (e.g. $10 USD)
  // Devnet: User token balance >= rawThreshold (e.g. 10 raw tokens)
  let isEligible = false;
  if (isMainnet) {
    isEligible = rawThreshold <= 0 || userBalanceUsd >= rawThreshold;
  } else {
    isEligible = rawThreshold <= 0 || (realBalance ?? 0) >= rawThreshold;
  }

  return {
    realBalance,
    tokenPriceUsd,
    userBalanceUsd,
    isEligible,
    isCheckingBalance,
    isMainnet,
    error,
    refetchBalance: checkBalance,
    MIN_REAL_REQUIRED: rawThreshold,
    MIN_RWD_USD_REQUIRED: rawThreshold,
  };
}
