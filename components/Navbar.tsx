'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from './ConnectWalletButton';
import { Gamepad2, ArrowDownToLine } from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'PLAY', href: '/', icon: Gamepad2 },
    { label: 'WITHDRAW', href: '/withdraw', icon: ArrowDownToLine },
  ];

  return (
    <nav className="w-full bg-[#090514]/90 border-b border-purple-500/30 backdrop-blur-xl sticky top-0 z-50 shadow-[0_4px_25px_rgba(168,85,247,0.2)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">

          {/* Logo & Title */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-violet-400 p-0.5 shadow-[0_0_18px_rgba(168,85,247,0.6)] group-hover:scale-105 transition-transform overflow-hidden">
              <img src="/logo.jpg" alt="$RWD Logo" className="w-full h-full object-cover rounded-[10px] group-hover:scale-110 transition-transform" />
            </div>
            <div className="flex flex-col">
              <span className="font-press-start text-xs sm:text-sm font-extrabold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-300 via-fuchsia-400 to-pink-300 drop-shadow-[0_0_8px_rgba(217,70,239,0.5)]">
                $RWD
              </span>
              <span className="text-[8px] font-mono font-bold tracking-widest text-purple-300/80 uppercase">
                Rewind Static
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-2 bg-[#130b24]/80 p-1.5 rounded-full border border-purple-500/25 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full font-press-start text-[10px] tracking-wider transition-all duration-300 ${isActive
                      ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 text-white font-bold shadow-[0_0_15px_rgba(168,85,247,0.6)] border border-purple-400/40'
                      : 'text-purple-200/70 hover:text-fuchsia-300 hover:bg-purple-500/15'
                    }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-purple-400'}`} />
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
        <div className="flex md:hidden items-center justify-around py-2 border-t border-purple-500/15">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-press-start text-[9px] ${isActive
                    ? 'text-fuchsia-300 font-bold bg-purple-500/20 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                    : 'text-purple-200/60 hover:text-fuchsia-300'
                  }`}
              >
                <Icon className="w-3 h-3 text-purple-400" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
