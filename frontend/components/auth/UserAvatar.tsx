"use client"

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/store/hooks'
import { LogOut, Settings } from 'lucide-react'

export function UserAvatar() {
  const { user, isAuthenticated } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (!isAuthenticated || !user) return null

  async function handleSignOut() {
    await supabase.auth.signOut()
    // AuthProvider listener handles redirect and state clear
  }

  return (
    <div className="relative">
      {/* Popup menu — shows above the avatar */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-56
          bg-gray-800 border border-gray-700 rounded-xl shadow-2xl
          overflow-hidden z-50">

          {/* User info header */}
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-white font-medium text-sm truncate">
              {user.fullName || 'User'}
            </p>
            <p className="text-gray-400 text-xs truncate">
              {user.email}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button className="w-full flex items-center gap-3 px-4 py-2.5
              text-gray-300 hover:bg-gray-700 hover:text-white
              transition-colors text-sm">
              <Settings size={15} />
              Settings
            </button>

            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-4 py-2.5
                text-red-400 hover:bg-red-500/10 hover:text-red-300
                transition-colors text-sm">
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      )}

      {/* Avatar trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 p-2 rounded-xl
          hover:bg-gray-800 transition-colors w-full group">

        {/* Avatar circle */}
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt={user.fullName || user.email}
            className="w-8 h-8 rounded-full object-cover ring-2
              ring-gray-700 group-hover:ring-blue-500 transition-all"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br
            from-blue-500 to-purple-600 flex items-center justify-center
            ring-2 ring-gray-700 group-hover:ring-blue-500
            transition-all flex-shrink-0">
            <span className="text-white text-xs font-bold">
              {user.initials}
            </span>
          </div>
        )}

        {/* Name + email */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-white text-sm font-medium truncate">
            {user.fullName?.split(' ')[0] || 'User'}
          </p>
          <p className="text-gray-500 text-xs truncate">
            {user.email}
          </p>
        </div>
      </button>

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
