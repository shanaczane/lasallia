// Sends signed-out visitors to /login. Also checks when a page is restored
// with the Back button, and when the user signs out in another tab.
'use client'

import { useEffect } from 'react'
import { getToken } from '@/lib/auth'

export function useRequireSession() {
  useEffect(() => {
    function check() {
      if (getToken()) return
      // Hide first so a restored page doesn't flash the old account for the
      // moment before the navigation lands.
      document.documentElement.style.visibility = 'hidden'
      window.location.replace('/login')
    }
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) check()
    }
    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }

    check()
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', check)
    }
  }, [])
}
