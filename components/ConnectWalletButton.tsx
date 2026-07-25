'use client';

import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { motion } from 'framer-motion';
import { Wallet, LogOut, Copy, Check } from 'lucide-react';
import React, { useState } from 'react';

export function ConnectWalletButton() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const [copied, setCopied] = useState(false);

  const isConnected = !!primaryWallet;
  const address = primaryWallet?.address;

  const truncatedAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : '';

  const handleCopy = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex items-center justify-end">
      {!isConnected ? (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAuthFlow(true)}
          className="flex items-center gap-1.5 md:gap-2 px-4 md:px-6 py-2 md:py-2.5 bg-gradient-to-r from-[#81c784] to-[#4caf50] rounded-full shadow-[0_0_20px_rgba(76,175,80,0.4)] hover:shadow-[0_0_30px_rgba(76,175,80,0.6)] transition-all duration-300 group cursor-pointer"
        >
          <Wallet className="w-4 h-4 text-[#051a0a] group-hover:rotate-12 transition-transform" />
          <span className="text-[10px] md:text-xs font-bold text-[#051a0a] uppercase tracking-widest font-[family-name:var(--font-montserrat)] whitespace-nowrap">
            Connect
          </span>
        </motion.button>
      ) : (
        <div className="flex items-center gap-2">
          {/* Address pill */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#4caf50]/20 to-[#81c784]/10 border border-[#4caf50]/40 rounded-full transition-all duration-300 hover:border-[#4caf50]/70 cursor-pointer backdrop-blur-md"
          >
            <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse" />
            <span className="text-xs font-bold text-[#81c784] uppercase tracking-wider font-mono">
              {truncatedAddress}
            </span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-[#4caf50]/60 hover:text-[#4caf50]" />
            )}
          </motion.button>

          {/* Disconnect button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleLogOut()}
            className="p-2.5 bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 rounded-full transition-all duration-300 group cursor-pointer backdrop-blur-md"
            title="Disconnect"
          >
            <LogOut className="w-4 h-4 text-white/60 group-hover:text-red-400 transition-colors" />
          </motion.button>
        </div>
      )}
    </div>
  );
}
