'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { DynamicContextProvider, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';

interface WalletContextType {
  primaryWallet: { address: string } | null;
  setShowAuthFlow: (show: boolean) => void;
  handleLogOut: () => Promise<void>;
  connectNativeSolana: () => Promise<void>;
  walletError: string | null;
}

const WalletContext = createContext<WalletContextType>({
  primaryWallet: null,
  setShowAuthFlow: () => {},
  handleLogOut: async () => {},
  connectNativeSolana: async () => {},
  walletError: null,
});

function DynamicWalletBridge({ children }: { children: React.ReactNode }) {
  const [nativeAddress, setNativeAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

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

  const activeAddress = dynamicWalletAddress || nativeAddress;
  const primaryWallet = activeAddress ? { address: activeAddress } : null;

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
