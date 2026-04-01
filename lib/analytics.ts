import { sendGAEvent } from '@next/third-parties/google'

export function trackEvent(action: string, params?: Record<string, string | number>) {
  if (typeof window === 'undefined') return
  try {
    sendGAEvent('event', action, params || {})
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.warn('[GA]', action, e)
  }
}

export const GA_EVENTS = {
  LINEUP_SAVE: 'lineup_save',
  LINEUP_CHIP_ACTIVATE: 'lineup_chip_activate',
  LEAGUE_CREATE: 'league_create',
  LEAGUE_ROSTER_UPLOAD: 'league_roster_upload',
} as const
