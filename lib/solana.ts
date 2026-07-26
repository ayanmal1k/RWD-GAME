import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Re-usable Solana connection configured with the environment RPC
export const solanaConnection = new Connection(RPC_URL, 'confirmed');

export const REAL_TOKEN_MINT =
  process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS ||
  process.env.REAL_TOKEN_MINT_ADDRESS ||
  'BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv';

export const MIN_REAL_REQUIRED = 1000000;

export async function fetchRealTokenBalance(
  ownerAddress: string,
  connection: Connection = solanaConnection
): Promise<number> {
  if (!ownerAddress) return 0;
  try {
    const ownerPubKey = new PublicKey(ownerAddress);
    const mintPubKey = new PublicKey(REAL_TOKEN_MINT);

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
    console.error('Error fetching REAL token balance:', err);
    return 0;
  }
}
