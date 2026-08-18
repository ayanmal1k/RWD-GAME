'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DynamicContextProvider, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';

import { useRealTokenBalance } from '@/hooks/useRealTokenBalance';

interface WalletContextType {
  primaryWallet: { address: string } | null;
  setShowAuthFlow: (show: boolean) => void;
  handleLogOut: () => Promise<void>;
  connectNativeSolana: () => Promise<void>;
  walletError: string | null;
  realBalance: number | null;
  isCheckingBalance: boolean;
  isEligible: boolean;
  refetchBalance: () => Promise<void>;
  /** Whether the wallet has been authenticated via signature challenge. */
  isAuthenticated: boolean;
  /** Whether authentication is currently in progress. */
  isAuthenticating: boolean;
}

const WalletContext = createContext<WalletContextType>({
  primaryWallet: null,
  setShowAuthFlow: () => {},
  handleLogOut: async () => {},
  connectNativeSolana: async () => {},
  walletError: null,
  realBalance: null,
  isCheckingBalance: false,
  isEligible: false,
  refetchBalance: async () => {},
  isAuthenticated: false,
  isAuthenticating: false,
});

/**
 * Get the Solana wallet provider from the browser (Phantom / Solflare).
 */
function getWalletProvider(): any {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).solana ||
    (window as any).phantom?.solana ||
    (window as any).solflare ||
    null
  );
}

function DynamicWalletBridge({ children }: { children: React.ReactNode }) {
  const [nativeAddress, setNativeAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Try to safely access Dynamic Context
  let dynamicWalletAddress: string | null = null;
  let dynamicSetShowAuthFlow: ((show: boolean) => void) | null = null;
  let dynamicHandleLogOut: (() => Promise<void>) | null = null;

  try {
    const dyn = useDynamicContext();
    if (dyn && dyn.primaryWallet?.address) {
      dynamicWalletAddress = dyn.primaryWallet.address;
    }
    if (dyn && dyn.setShowAuthFlow) {
      dynamicSetShowAuthFlow = dyn.setShowAuthFlow;
    }
    if (dyn && dyn.handleLogOut) {
      dynamicHandleLogOut = dyn.handleLogOut;
    }
  } catch (e) {
    // Dynamic context not available or error
  }

  // Restore saved native wallet connection from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('real_climber_native_wallet');
    if (saved) {
      setNativeAddress(saved);
      // Auto reconnect phantom if available
      const solana = (window as any).solana || (window as any).phantom?.solana;
      if (solana && solana.isPhantom) {
        solana.connect({ onlyIfTrusted: true })
          .then((res: any) => {
            if (res?.publicKey) {
              setNativeAddress(res.publicKey.toString());
            }
          })
          .catch(() => {});
      }
    }
  }, []);

  const activeAddress = dynamicWalletAddress || nativeAddress;
  const primaryWallet = activeAddress ? { address: activeAddress } : null;

  // Track $REAL Token balance using custom hook
  const { realBalance, isCheckingBalance, isEligible, refetchBalance } = useRealTokenBalance(activeAddress);

  // -------------------------------------------------------------------------
  // Wallet Authentication via Signature Challenge
  // -------------------------------------------------------------------------
  const authenticateWallet = useCallback(async (address: string) => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);

    try {
      // Step 1: Request challenge nonce from server
      const challengeRes = await fetch('/api/auth/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address }),
      });

      if (!challengeRes.ok) {
        throw new Error('Failed to get auth challenge');
      }

      const { nonce } = await challengeRes.json();

      // Step 2: Sign the nonce with the wallet
      const provider = getWalletProvider();
      if (!provider) {
        throw new Error('No wallet provider available for signing');
      }

      // Encode the nonce as bytes for signing
      const messageBytes = new TextEncoder().encode(nonce);
      let signatureBase64: string;

      if (provider.signMessage) {
        // Phantom / Solflare signMessage returns { signature: Uint8Array }
        const result = await provider.signMessage(messageBytes, 'utf8');
        const sigBytes = result.signature || result;

        if (sigBytes instanceof Uint8Array) {
          signatureBase64 = btoa(String.fromCharCode(...sigBytes));
        } else if (typeof sigBytes === 'string') {
          signatureBase64 = sigBytes;
        } else {
          throw new Error('Unexpected signature format');
        }
      } else {
        throw new Error('Wallet does not support message signing');
      }

      // Step 3: Submit signature for verification
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          nonce,
          signature: signatureBase64,
        }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        throw new Error(data.error || 'Auth verification failed');
      }

      setIsAuthenticated(true);
      console.log('Wallet authenticated successfully:', address);
    } catch (err: any) {
      console.error('Wallet authentication failed:', err);
      setIsAuthenticated(false);
      // Don't set a walletError here — the user rejected the signature prompt
      // or there was a network issue. They can still see their balance, etc.
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating]);

  // Auto-authenticate when wallet address becomes available
  useEffect(() => {
    if (activeAddress && !isAuthenticated && !isAuthenticating) {
      authenticateWallet(activeAddress);
    }
    // Reset auth state when wallet disconnects
    if (!activeAddress) {
      setIsAuthenticated(false);
    }
  }, [activeAddress]); // eslint-disable-line react-hooks/exhaustive-deps

  const connectNativeSolana = async () => {
    setWalletError(null);
    if (typeof window === 'undefined') return;

    const solana = (window as any).solana || (window as any).phantom?.solana || (window as any).solflare;

    if (solana) {
      try {
        const response = await solana.connect();
        const pubKey = response.publicKey?.toString() || solana.publicKey?.toString();
        if (pubKey) {
          setNativeAddress(pubKey);
          localStorage.setItem('real_climber_native_wallet', pubKey);
          return;
        }
      } catch (err: any) {
        console.warn('Native wallet connection rejected/failed:', err);
        setWalletError(err.message || 'Connection rejected');
        return;
      }
    }

    // Fallback: If no extension found, prompt user or show dynamic modal if available
    if (dynamicSetShowAuthFlow) {
      try {
        dynamicSetShowAuthFlow(true);
      } catch (e) {
        setWalletError('No Solana wallet extension (Phantom/Solflare) detected in your browser.');
      }
    } else {
      setWalletError('Please install Phantom or Solflare wallet extension to connect.');
    }
  };

  const handleLogOut = async () => {
    setNativeAddress(null);
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('real_climber_native_wallet');
      const solana = (window as any).solana || (window as any).phantom?.solana;
      if (solana && solana.disconnect) {
        try {
          await solana.disconnect();
        } catch (e) {}
      }
    }
    if (dynamicHandleLogOut) {
      try {
        await dynamicHandleLogOut();
      } catch (e) {}
    }
  };

  const setShowAuthFlow = (show: boolean) => {
    if (show) {
      connectNativeSolana();
    }
  };

  return (
    <WalletContext.Provider
      value={{
        primaryWallet,
        setShowAuthFlow,
        handleLogOut,
        connectNativeSolana,
        walletError,
        realBalance,
        isCheckingBalance,
        isEligible,
        refetchBalance,
        isAuthenticated,
        isAuthenticating,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '';

  // If environment ID is set, wrap in DynamicContextProvider as primary
  if (environmentId) {
    return (
      <DynamicContextProvider
        settings={{
          environmentId,
          walletConnectors: [SolanaWalletConnectors],
          initialAuthenticationMode: 'connect-only',
        }}
      >
        <DynamicWalletBridge>{children}</DynamicWalletBridge>
      </DynamicContextProvider>
    );
  }

  // Fallback to Native Solana Wallet Bridge
  return <DynamicWalletBridge>{children}</DynamicWalletBridge>;
}

export function useAppWallet() {
  return useContext(WalletContext);
}
