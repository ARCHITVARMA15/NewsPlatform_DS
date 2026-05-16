import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { StreamMessage } from '@/lib/types'

interface AgentState {
  messages: StreamMessage[]
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
    addMessage(state, action: PayloadAction<StreamMessage>) {
      state.messages.push(action.payload)
    },
    setMessages(state, action: PayloadAction<StreamMessage[]>) {
      state.messages = action.payload
    },
    updateLastMessage(state, action: PayloadAction<Partial<StreamMessage>>) {
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
    loadSession(state, action: PayloadAction<{ threadId: string; messages: StreamMessage[] }>) {
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
  setMessages,
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
