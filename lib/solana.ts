import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const isMainnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta';
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || (isMainnet ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');

// Re-usable Solana connection configured with the environment RPC
export const solanaConnection = new Connection(RPC_URL, 'confirmed');

export const RWD_TOKEN_MINT =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta'
    ? process.env.NEXT_PUBLIC_RWD_MINT_MAINNET
    : process.env.NEXT_PUBLIC_RWD_MINT_DEVNET) ||
  process.env.NEXT_PUBLIC_RWD_TOKEN_ADDRESS ||
  process.env.RWD_TOKEN_MINT_ADDRESS ||
  process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS ||
  process.env.REAL_TOKEN_MINT_ADDRESS ||
  '6m7z9mjuZdMJq4DG4ze6BQHCtjoBMowyE2QhudbpeGUa';

export const REAL_TOKEN_MINT = RWD_TOKEN_MINT;

export const MIN_RWD_REQUIRED = Number(
  process.env.NEXT_PUBLIC_MIN_RWD_REQUIRED ??
  process.env.NEXT_PUBLIC_MIN_REAL_REQUIRED ??
  0
);
export const MIN_REAL_REQUIRED = MIN_RWD_REQUIRED;

export async function fetchRwdTokenBalance(
  ownerAddress: string,
  connection: Connection = solanaConnection
): Promise<number> {
  if (!ownerAddress) return 0;
  try {
    const ownerPubKey = new PublicKey(ownerAddress);
    const mintPubKey = new PublicKey(RWD_TOKEN_MINT);

    const accountBalances = new Map<string, number>();

    const fetchFromProgram = async (programId: PublicKey) => {
      try {
        const accounts = await connection.getParsedTokenAccountsByOwner(ownerPubKey, {
          mint: mintPubKey,
          programId,
        });
        for (const acc of accounts.value) {
          const pubkeyStr = acc.pubkey.toString();
          const amount = acc.account.data.parsed?.info?.tokenAmount?.uiAmount;
          const parsedAmount = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
          accountBalances.set(pubkeyStr, parsedAmount);
        }
      } catch (e) {
        // Quietly ignore if program has no token accounts
      }
    };

    await Promise.all([
      fetchFromProgram(TOKEN_PROGRAM_ID),
      fetchFromProgram(TOKEN_2022_PROGRAM_ID),
    ]);

    let totalBalance = 0;
    for (const bal of accountBalances.values()) {
      totalBalance += bal;
    }

    return totalBalance;
  } catch (err) {
    console.error('Error fetching RWD token balance:', err);
    return 0;
  }
}

export const fetchRealTokenBalance = fetchRwdTokenBalance;
