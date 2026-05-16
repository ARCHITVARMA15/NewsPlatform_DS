import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface User {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  initials: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  accessToken: string | null
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0][0].toUpperCase()
  }
  return email[0].toUpperCase()
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  accessToken: null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<{
      id: string
      email: string
      fullName: string | null
      avatarUrl: string | null
      accessToken: string
    }>) {
      const { id, email, fullName, avatarUrl, accessToken } = action.payload
      state.user = {
        id,
        email,
        fullName,
        avatarUrl,
        initials: getInitials(fullName, email),
      }
      state.isAuthenticated = true
      state.accessToken = accessToken
    },
    clearUser(state) {
      state.user = null
      state.isAuthenticated = false
      state.accessToken = null
    },
    updateAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload
    },
  },
})

export const { setUser, clearUser, updateAccessToken } = authSlice.actions
export default authSlice.reducer
