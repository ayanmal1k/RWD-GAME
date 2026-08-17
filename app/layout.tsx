import type { Metadata } from 'next'
import { Press_Start_2P, Outfit } from 'next/font/google'
import './globals.css'
import { DynamicProvider } from '@/components/DynamicProvider'
import { Navbar } from '@/components/Navbar'

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
  metadataBase: new URL('https://rewindstatic.io'),
  title: 'Rewind Static ($RWD) — Retro Arcade Game & Solana Token Exchanger',
  description: 'Rewind Static ($RWD) Arcade. Play the retro climber game, collect coins, climb the live global leaderboard, and exchange coins for $RWD Solana tokens.',
  keywords: ['$RWD', 'Rewind Static', 'RWD Token', 'Crypto', 'Solana', 'Web3', 'Mountain Climber', 'Retro Game'],
  authors: [{ name: 'Rewind Static' }],
  creator: 'Rewind Static',
  publisher: 'Rewind Static',
  icons: {
    icon: '/logo.jpg',
    shortcut: '/logo.jpg',
    apple: '/logo.jpg',
  },
  openGraph: {
    title: 'Rewind Static ($RWD) — Retro Arcade Game & Solana Token Exchanger',
    description: 'Play the retro climber game, collect coins, climb the live global leaderboard, and exchange coins for $RWD Solana tokens.',
    url: 'https://rewindstatic.io',
    siteName: 'Rewind Static ($RWD)',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/logo.jpg',
        width: 1200,
        height: 630,
        alt: 'Rewind Static ($RWD) Hero Banner',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rewind Static ($RWD) — Retro Arcade Game & Solana Token Exchanger',
    description: 'Play the retro climber game, collect coins, climb the live global leaderboard, and exchange coins for $RWD Solana tokens.',
    creator: '@RewindStatic',
    images: ['/logo.jpg'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${pressStart.variable} ${outfit.variable}`}>
      <body className="font-sans antialiased bg-[#07040d] text-[#f5d0fe] selection:bg-purple-600 selection:text-white">
        <DynamicProvider>
          <Navbar />
          {children}
        </DynamicProvider>
      </body>
    </html>
  )
}
