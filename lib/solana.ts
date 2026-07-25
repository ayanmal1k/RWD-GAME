import { Connection } from '@solana/web3.js';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Re-usable Solana connection configured with the environment RPC
export const solanaConnection = new Connection(RPC_URL, 'confirmed');
