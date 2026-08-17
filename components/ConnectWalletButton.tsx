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
          className="flex items-center gap-1.5 md:gap-2 px-4 md:px-5 py-2 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-full shadow-[0_0_20px_rgba(250,204,21,0.4)] hover:shadow-[0_0_30px_rgba(250,204,21,0.7)] transition-all duration-300 group cursor-pointer border border-yellow-300/40"
        >
          <Wallet className="w-4 h-4 text-[#0a0802] group-hover:rotate-12 transition-transform" />
          <span className="text-[10px] md:text-xs font-extrabold text-[#0a0802] uppercase tracking-widest font-mono whitespace-nowrap">
            Connect Wallet
          </span>
        </motion.button>
      ) : (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
          {/* $REAL Token Balance Pill */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs font-mono backdrop-blur-md ${
              isCheckingBalance
                ? 'bg-yellow-500/10 border-yellow-500/30 text-amber-300 animate-pulse'
                : isEligible
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-red-500/15 border-red-500/40 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
            }`}
            title={
              isEligible
                ? `Holdings: ${(realBalance ?? 0).toLocaleString()} $REAL (Eligible to Play)`
                : `Holdings: ${(realBalance ?? 0).toLocaleString()} $REAL`
            }
          >
            <img src="/logo.jpeg" alt="$REAL" className="w-4 h-4 rounded-full border border-amber-400/40 object-cover" />
            <span className="font-bold">
              {isCheckingBalance
                ? 'Checking...'
                : `${(realBalance ?? 0).toLocaleString()} $REAL`}
            </span>
            {!isCheckingBalance && (
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${isEligible ? 'bg-emerald-500/30 text-emerald-200' : 'bg-red-500/30 text-red-200'}`}>
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
            className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-amber-500/20 border border-yellow-500/40 rounded-full shadow-[0_0_12px_rgba(234,179,8,0.25)] backdrop-blur-md select-none"
            title="Total Banked Coins"
          >
            <CoinIcon className="w-5 h-5 drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]" />
            <span className="text-xs font-extrabold text-yellow-300 font-mono tracking-wider">
              {bankCoins}
            </span>
          </motion.div>

          {/* Address pill */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#171206]/90 border border-yellow-500/30 rounded-full transition-all duration-300 hover:border-yellow-400/60 cursor-pointer backdrop-blur-md"
          >
            <div className={`w-2 h-2 rounded-full ${isEligible ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]'} animate-pulse`} />
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider font-mono">
              {truncatedAddress}
            </span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-yellow-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-amber-400/60 hover:text-amber-300" />
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
