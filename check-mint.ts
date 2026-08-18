import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=06e864fe-b9f9-4ac7-b032-0cf1a833cafe';
const RWD_TOKEN_MINT = 'HnfN7ZSaVQMKSKbz3pUdsmPuGkgAYAEnVq8pxsSH9Wow';

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const mintPubKey = new PublicKey(RWD_TOKEN_MINT);
  const accountInfo = await connection.getAccountInfo(mintPubKey);
  console.log(`Account Info for mint ${RWD_TOKEN_MINT}:`);
  if (accountInfo) {
    console.log(`Owner: ${accountInfo.owner.toString()}`);
    console.log(`Executable: ${accountInfo.executable}`);
    console.log(`Size: ${accountInfo.data.length}`);
  } else {
    console.log('Account does not exist on mainnet.');
  }
}

main().catch(console.error);
