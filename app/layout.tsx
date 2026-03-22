import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-[#0c0c10] text-white min-h-screen">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
