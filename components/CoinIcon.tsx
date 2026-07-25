'use client';

import React from 'react';

interface CoinIconProps {
  className?: string;
}

export function CoinIcon({ className = 'w-5 h-5' }: CoinIconProps) {
  return (
    <div
      className={`inline-block shrink-0 select-none ${className}`}
      style={{
        backgroundImage: 'url(/coin.png)',
        backgroundSize: '600% 100%',
        backgroundPosition: '0% 0%',
        imageRendering: 'pixelated',
      }}
    />
  );
}
