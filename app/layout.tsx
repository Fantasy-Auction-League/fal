import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
})

export const metadata: Metadata = {
  title: 'FAL - Fantasy Auction League',
  description: 'Fantasy cricket platform for IPL',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="font-sans antialiased bg-[#f2f3f8] text-[#1a1a2e] min-h-screen" style={{ fontFamily: 'var(--font-jakarta), sans-serif' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
