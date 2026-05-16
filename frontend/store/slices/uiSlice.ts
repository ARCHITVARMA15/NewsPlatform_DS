import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface Notification {
  id: string
  message: string
  type: 'info' | 'success' | 'error'
  timestamp: string
}

interface UIState {
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'
  notifications: Notification[]
  breakingEventsCount: number
}

const initialState: UIState = {
  sidebarCollapsed: false,
  theme: 'dark',
  notifications: [],
  breakingEventsCount: 0,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    setTheme(state, action: PayloadAction<'dark' | 'light'>) {
      state.theme = action.payload
    },
    addNotification(
      state,
      action: PayloadAction<Omit<Notification, 'id' | 'timestamp'>>
    ) {
      state.notifications.push({
        ...action.payload,
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
      })
    },
    removeNotification(state, action: PayloadAction<string>) {
      state.notifications = state.notifications.filter(n => n.id !== action.payload)
    },
    clearNotifications(state) {
      state.notifications = []
    },
    setBreakingEventsCount(state, action: PayloadAction<number>) {
      state.breakingEventsCount = action.payload
    },
  },
})

export const {
  toggleSidebar,
  setTheme,
  addNotification,
  removeNotification,
  clearNotifications,
  setBreakingEventsCount,
} = uiSlice.actions
export default uiSlice.reducer
