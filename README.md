# 🧗 $REAL Mountain Climber — Web3 Retro Arcade Game & Solana Token Exchanger

![REAL Climber Banner](/logo.jpeg)

[![Solana](https://img.shields.io/badge/Solana-Mainnet-00FFA3?style=for-the-badge&logo=solana)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![Dynamic SDK](https://img.shields.io/badge/Dynamic-Solana_Auth-6366F1?style=for-the-badge)](https://dynamic.xyz)

> **"THIS IS NOT JUST A COIN. THIS IS $REAL."**
> 
> Welcome to the **$REAL Ibex Republic** Arcade! Play the endless retro climber game, collect spinning gold coins, climb the live global leaderboard, and exchange your banked game coins for **$REAL Solana Tokens** paid directly from an automated Treasury Wallet.

---

## 🌟 Key Features

### 🎮 Arcade Canvas Game Engine
- **Pixel-Art Retro Graphics**: Custom animated character sprites, dynamic platform generation, spring bounces, and falling obstacles.
- **Responsive Controls**: Desktop keyboard arrow keys / spacebar + interactive mobile touch controls and full-screen mode.
- **Server Anti-Cheat Verification**: HMAC signature-verified game sessions preventing score manipulation.

### 💰 $REAL Token Treasury Exchanger (`/withdraw`)
- **Direct Solana Payouts**: Automated token distribution from the Solana Treasury wallet directly to the player's wallet.
- **SPL Token & Decimals Support**: Native integration with `@solana/spl-token` supporting both standard SPL tokens and Token-2022.
- **Automated ATA Creation**: Dynamically creates the recipient's Associated Token Account on-chain if uninitialized.
- **Dynamic Exchange Calculation**: Instant real-time conversion at the rate of **10 Coins = 1 $REAL Token** with a **1,000 Coins Minimum Limit**.
- **On-Chain Audit Log**: Live personal transaction history table with direct Solscan / Solana Explorer transaction links.

### 🏆 Dynamic Leaderboard & Anti-Duplicate Rankings
- **Date-Filtered Competitions**: Configurable start and end date ranges stored in Firebase.
- **Unique Player Standings**: Enforces **1 position per player** (keeping only their personal highest score).
- **Toggle Control**: Live admin switch to turn public leaderboard display ON or OFF.

### 🔒 Password-Protected Admin Panel (`/admin`)
- **Restricted Access**: Password-authenticated login screen storing encrypted session state.
- **Global User Directory**: Full list of all registered player wallets, banked coin balances, total coins/tokens withdrawn, and total games played.
- **Live Leaderboard Inspector**: Real-time top 10 preview for any selected date range regardless of public toggle status.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16 (App Router)](https://nextjs.org/)
- **Frontend**: React 19, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons
- **Blockchain**: Solana Web3.js (`@solana/web3.js`), SPL Token (`@solana/spl-token`), Dynamic Wallet SDK (`@dynamic-labs/solana`)
- **Database**: Firebase Firestore (Realtime database for user banks, game history, withdrawal logs, and admin settings)
- **Anti-Cheat Engine**: Node.js Crypto HMAC session signing

---

## 🚀 Environment Setup

Create a `.env.local` file in the root directory:

```env
# Dynamic Environment ID
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=3111278c-942c-4a78-8aa0-15404dfe914e

# Solana Config
NEXT_PUBLIC_SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_HELIUS_KEY

# Firebase Config
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=real-climber-app-1234.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=real-climber-app-1234
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=real-climber-app-1234.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1074725311322
NEXT_PUBLIC_FIREBASE_APP_ID=1:1074725311322:web:...

# $REAL Solana Token Mint Address
NEXT_PUBLIC_REAL_TOKEN_ADDRESS=BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv
REAL_TOKEN_MINT_ADDRESS=BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv

# Solana Treasury Private Key (Base58 string or byte array)
TREASURY_SOLANA_PRIVATE_KEY=YOUR_SOLANA_TREASURY_PRIVATE_KEY
```

---

## ⚡ Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev

# 3. Build production bundle
npm run build
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Official Links

- **Website / App**: [$REAL Ibex Republic](https://realibexcoin.netlify.app/)
- **$REAL Token Mint**: `BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv`
- **Solscan Explorer**: [View $REAL on Solscan](https://solscan.io/token/BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv)
- **Telegram**: [Join Telegram](https://t.me/Realibexcoin)
- **X (Twitter)**: [Follow @Realibexcoin](https://x.com/Realibexcoin)

---

## 📜 License

Created with ❤️ for the **$REAL Ibex Republic** community. All rights reserved.
