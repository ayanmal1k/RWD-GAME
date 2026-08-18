import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=06e864fe-b9f9-4ac7-b032-0cf1a833cafe';
const RWD_TOKEN_MINT = 'aZXVx5Q5hwQQkSp5sJ8hWoNzjX4nFHQHmBX6oCjpump';

export async function fetchRwdTokenBalance(ownerAddress: string): Promise<number> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const ownerPubKey = new PublicKey(ownerAddress);
  const mintPubKey = new PublicKey(RWD_TOKEN_MINT);

  const accountBalances = new Map<string, number>();

  const fetchFromProgram = async (programId: PublicKey) => {
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
}

async function main() {
  const address = '4C5fXTm5W1rFXzrCdM9vRVvZD6Z4Aw2ERVBagvVaVJJb';
  const balance = await fetchRwdTokenBalance(address);
  console.log(`Balance for ${address}: ${balance}`);
}

main().catch(console.error);
