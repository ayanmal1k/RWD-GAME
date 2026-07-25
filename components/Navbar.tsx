'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from './ConnectWalletButton';
import { CoinIcon } from './CoinIcon';
import { Gamepad2, ArrowDownToLine, Trophy, ShieldCheck, Flame } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'PLAY', href: '/', icon: Gamepad2 },
    { label: 'WITHDRAW', href: '/withdraw', icon: ArrowDownToLine },
    { label: 'ADMIN', href: '/admin', icon: ShieldCheck },
  ];

  return (
    <nav className="w-full bg-[#0a0802]/90 border-b border-yellow-500/30 backdrop-blur-xl sticky top-0 z-50 shadow-[0_4px_25px_rgba(234,179,8,0.15)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          
          {/* Logo & Title */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-300 p-0.5 shadow-[0_0_15px_rgba(250,204,21,0.5)] group-hover:scale-105 transition-transform overflow-hidden">
              <img src="/logo.jpeg" alt="$REAL Logo" className="w-full h-full object-cover rounded-[10px] group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex flex-col">
              <span className="font-press-start text-xs sm:text-sm font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                $REAL
              </span>
              <span className="text-[8px] font-mono font-bold tracking-widest text-amber-400/80 uppercase">
                Mountain Climber
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-2 bg-[#171206]/80 p-1.5 rounded-full border border-yellow-500/20 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-press-start text-[10px] tracking-wider transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold shadow-[0_0_15px_rgba(234,179,8,0.5)]'
                      : 'text-amber-200/70 hover:text-yellow-300 hover:bg-yellow-500/10'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#0a0802]' : 'text-amber-400'}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Wallet Button */}
          <div className="flex items-center gap-3">
            <ConnectWalletButton />
          </div>

        </div>

        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-yellow-500/15">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-press-start text-[9px] ${
                  isActive
                    ? 'text-yellow-400 font-bold bg-yellow-500/15 border border-yellow-500/30'
                    : 'text-amber-200/60 hover:text-yellow-300'
                }`}
              >
                <Icon className="w-3 h-3 text-amber-400" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
