"use client"

import { useEffect } from 'react'
import { useAppDispatch } from '@/store/hooks'
import { setUser, clearUser, updateAccessToken } from '@/store/slices/authSlice'
import { supabase } from '@/lib/supabase/client'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    // Sync current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        dispatch(setUser({
          id: session.user.id,
          email: session.user.email ?? '',
          fullName: session.user.user_metadata?.full_name ?? null,
          avatarUrl: session.user.user_metadata?.avatar_url ?? null,
          accessToken: session.access_token,
        }))
      } else {
        dispatch(clearUser())
      }
    })

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          dispatch(setUser({
            id: session.user.id,
            email: session.user.email ?? '',
            fullName: session.user.user_metadata?.full_name ?? null,
            avatarUrl: session.user.user_metadata?.avatar_url ?? null,
            accessToken: session.access_token,
          }))
        } else {
          dispatch(clearUser())
        }

        if (_event === 'TOKEN_REFRESHED' && session?.access_token) {
          dispatch(updateAccessToken(session.access_token))
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [dispatch])

  return <>{children}</>
}
