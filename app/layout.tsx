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
  title: 'Omu Crazy Climber - Endless Retro Climber',
  description: 'Scale the platforms and collect spinning gold coins in this pixel-art arcade climber.',
  icons: {
    icon: '/idle.png',
    apple: '/idle.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${pressStart.variable} ${outfit.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
