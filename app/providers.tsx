'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SessionProvider } from 'next-auth/react'
import { trackEvent } from '@/lib/analytics'

function PageViewTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) trackEvent('page_view', { page_path: pathname })
  }, [pathname])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PageViewTracker />
      {children}
    </SessionProvider>
  )
}
