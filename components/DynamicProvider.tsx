'use client';

import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { SolanaWalletConnectors } from '@dynamic-labs/solana';
import React from 'react';

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  // We use the environment variable if present, otherwise we provide a placeholder
  // so the app still renders, though authentication will fail without a valid ID.
  const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || '3111278c-942c-4a78-8aa0-15404dfe914e';

  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [SolanaWalletConnectors],
        initialAuthenticationMode: 'connect-only',
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
