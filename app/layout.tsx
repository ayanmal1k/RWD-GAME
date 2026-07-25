import type { Metadata } from 'next'
import { Press_Start_2P, Outfit } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const pressStart = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start',
})

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '600', '800'],
  variable: '--font-outfit',
})

export const metadata: Metadata = {
  title: '$REAL IBEX — THIS IS NOT JUST A COIN. THIS IS $REAL.',
  description: 'Join the $REAL Ibex Republic. Built for growth, designed to last. Real vision, real community, real future. Play $REAL Mountain Climber, collect coins, and exchange for $REAL Solana tokens.',
  keywords: ['$REAL', 'Real Ibex', 'Real Coin', 'Crypto', 'Memecoin', 'Solana', 'Web3', 'Real Ecosystem', 'Ibex Republic', 'Mountain Climber', 'Real Token'],
  authors: [{ name: 'Real Ibex Republic' }],
  creator: 'Real Ibex Republic',
  publisher: 'Real Ibex Republic',
  icons: {
    icon: '/logo.jpeg',
    shortcut: '/logo.jpeg',
    apple: '/logo.jpeg',
  },
  openGraph: {
    title: '$REAL IBEX — THIS IS NOT JUST A COIN. THIS IS $REAL.',
    description: 'Join the $REAL Ibex Republic. Built for growth, designed to last. Real vision, real community, real future. Scale the mountain and earn $REAL tokens.',
    url: 'https://realibex.com',
    siteName: '$REAL IBEX REPUBLIC',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/logo.jpeg',
        width: 1200,
        height: 630,
        alt: '$REAL Ibex Republic Hero Banner',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '$REAL IBEX — THIS IS NOT JUST A COIN. THIS IS $REAL.',
    description: 'Join the $REAL Ibex Republic. Built for growth, designed to last. Real vision, real community, real future.',
    creator: '@RealIbex',
    images: ['/logo.jpeg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

import { DynamicProvider } from '@/components/DynamicProvider';
import { Navbar } from '@/components/Navbar';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${pressStart.variable} ${outfit.variable}`}>
      <body className="font-sans antialiased bg-[#0a0802] text-[#fef08a]">
        <DynamicProvider>
          <Navbar />
          {children}
          <Analytics />
        </DynamicProvider>
      </body>
    </html>
  )
}
