import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface Message {
  id: string
  role: 'user' | 'agent'
  content: string
  timestamp: string
  metadata?: {
    summary?: string
    insights?: string[]
    sentiment?: string
    confidence_scores?: Record<string, number>
    sources?: unknown[]
    isInterrupted?: boolean
    availableActions?: string[]
    pdfPath?: string
  }
}

interface AgentState {
  messages: Message[]
  threadId: string | null
  isStreaming: boolean
  currentStep: string | null
  isInterrupted: boolean
  availableActions: string[]
  error: string | null
  sessions: unknown[]
}

const initialState: AgentState = {
  messages: [],
  threadId: null,
  isStreaming: false,
  currentStep: null,
  isInterrupted: false,
  availableActions: [],
  error: null,
  sessions: [],
}

const agentSlice = createSlice({
  name: 'agent',
  initialState,
  reducers: {
    setThreadId(state, action: PayloadAction<string>) {
      state.threadId = action.payload
    },
    addMessage(state, action: PayloadAction<Message>) {
      state.messages.push(action.payload)
    },
    updateLastMessage(state, action: PayloadAction<Partial<Message>>) {
      const last = state.messages[state.messages.length - 1]
      if (last) {
        Object.assign(last, action.payload)
      }
    },
    setStreaming(state, action: PayloadAction<boolean>) {
      state.isStreaming = action.payload
    },
    setCurrentStep(state, action: PayloadAction<string | null>) {
      state.currentStep = action.payload
    },
    setInterrupted(state, action: PayloadAction<{ isInterrupted: boolean; availableActions: string[] }>) {
      state.isInterrupted = action.payload.isInterrupted
      state.availableActions = action.payload.availableActions
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload
    },
    resetConversation(state) {
      state.messages = []
      state.threadId = null
      state.isStreaming = false
      state.currentStep = null
      state.isInterrupted = false
      state.availableActions = []
      state.error = null
    },
    setSessions(state, action: PayloadAction<unknown[]>) {
      state.sessions = action.payload
    },
    loadSession(state, action: PayloadAction<{ threadId: string; messages: Message[] }>) {
      state.threadId = action.payload.threadId
      state.messages = action.payload.messages
      state.isStreaming = false
      state.isInterrupted = false
      state.error = null
    },
  },
})

export const {
  setThreadId,
  addMessage,
  updateLastMessage,
  setStreaming,
  setCurrentStep,
  setInterrupted,
  setError,
  resetConversation,
  setSessions,
  loadSession,
} = agentSlice.actions
export default agentSlice.reducer
