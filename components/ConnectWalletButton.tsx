'use client';

import { useAppWallet } from './DynamicProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, LogOut, Copy, Check, Coins, AlertTriangle } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { CoinIcon } from './CoinIcon';

export function ConnectWalletButton() {
  const { primaryWallet, setShowAuthFlow, handleLogOut, realBalance, isCheckingBalance, isEligible } = useAppWallet();
  const [copied, setCopied] = useState(false);
  const [bankCoins, setBankCoins] = useState<number>(0);

  const isConnected = !!primaryWallet;
  const address = primaryWallet?.address;

  const truncatedAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : '';

  useEffect(() => {
    if (!address) {
      setBankCoins(0);
      return;
    }

    const userRef = doc(db, 'users', address);
    const unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setBankCoins(data.totalCoins || 0);
        }
      },
      (error) => {
        console.warn('Coin bank snapshot warning:', error);
      }
    );

    return () => unsubscribe();
  }, [address]);

  const handleCopy = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    try {
      await handleLogOut();
    } catch (e) {
      console.warn('Silent logout error caught:', e);
    }
  };

  return (
    <div className="flex items-center justify-end">
      {!isConnected ? (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAuthFlow(true)}
          className="flex items-center gap-1.5 md:gap-2 px-4 md:px-5 py-2 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:shadow-[0_0_30px_rgba(217,70,239,0.8)] transition-all duration-300 group cursor-pointer border border-fuchsia-400/50"
        >
          <Wallet className="w-4 h-4 text-white group-hover:rotate-12 transition-transform" />
          <span className="text-[10px] md:text-xs font-extrabold text-white uppercase tracking-widest font-mono whitespace-nowrap">
            Connect Wallet
          </span>
        </motion.button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
          {/* $RWD Token Balance Pill */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-mono backdrop-blur-md ${isCheckingBalance
                ? 'bg-purple-500/10 border-purple-500/30 text-fuchsia-300 animate-pulse'
                : isEligible
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                  : 'bg-red-500/15 border-red-500/40 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
              }`}
            title={
              isEligible
                ? `Holdings: ${(realBalance ?? 0).toLocaleString()} $RWD (Eligible to Play)`
                : `Holdings: ${(realBalance ?? 0).toLocaleString()} $RWD`
            }
          >
            <img src="/logo.jpg" alt="$RWD" className="w-4 h-4 rounded-full border border-fuchsia-400/40 object-cover" />
            <span className="font-bold">
              {isCheckingBalance
                ? 'Checking...'
                : `${(realBalance ?? 0).toLocaleString()} $RWD`}
            </span>
            {!isCheckingBalance && (
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${isEligible ? 'bg-fuchsia-500/30 text-fuchsia-200' : 'bg-red-500/30 text-red-200'}`}>
                {isEligible ? 'UNLOCKED' : 'LOCKED'}
              </span>
            )}
          </div>

          {/* Banked Coins Pill */}
          <motion.div
            key={bankCoins}
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.18, 1] }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-500/20 via-fuchsia-500/15 to-purple-500/20 border border-purple-500/40 rounded-full shadow-[0_0_12px_rgba(168,85,247,0.25)] backdrop-blur-md select-none"
            title="Total Banked Coins"
          >
            <CoinIcon className="w-5 h-5 drop-shadow-[0_0_6px_rgba(217,70,239,0.8)]" />
            <span className="text-xs font-extrabold text-fuchsia-300 font-mono tracking-wider">
              {bankCoins}
            </span>
          </motion.div>

          {/* Address pill */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#140b24]/90 border border-purple-500/30 rounded-full transition-all duration-300 hover:border-purple-400/60 cursor-pointer backdrop-blur-md"
          >
            <div className={`w-2 h-2 rounded-full ${isEligible ? 'bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.9)]' : 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]'} animate-pulse`} />
            <span className="text-xs font-bold text-purple-200 uppercase tracking-wider font-mono">
              {truncatedAddress}
            </span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-fuchsia-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-purple-400/70 hover:text-fuchsia-300" />
            )}
          </motion.button>

          {/* Disconnect button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleDisconnect}
            className="p-2 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded-full transition-all duration-300 group cursor-pointer backdrop-blur-md"
            title="Disconnect"
          >
            <LogOut className="w-3.5 h-3.5 text-white/60 group-hover:text-red-400 transition-colors" />
          </motion.button>
        </div>
      )}
    </div>
  );
}
