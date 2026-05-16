"use client"

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAppDispatch } from '@/store/hooks'
import { setUser, clearUser, updateAccessToken } from '@/store/slices/authSlice'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        dispatch(setUser({
          id: session.user.id,
          email: session.user.email!,
          fullName: session.user.user_metadata?.full_name || null,
          avatarUrl: session.user.user_metadata?.avatar_url || null,
          accessToken: session.access_token,
        }))
      }
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          dispatch(setUser({
            id: session.user.id,
            email: session.user.email!,
            fullName: session.user.user_metadata?.full_name || null,
            avatarUrl: session.user.user_metadata?.avatar_url || null,
            accessToken: session.access_token,
          }))
        }

        if (event === 'SIGNED_OUT') {
          dispatch(clearUser())
          localStorage.removeItem('persist:datastraw-root')
          window.location.href = '/login'
        }

        if (event === 'TOKEN_REFRESHED' && session) {
          dispatch(updateAccessToken(session.access_token))
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [dispatch])

  return <>{children}</>
}
