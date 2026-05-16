import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface DebateMessage {
  id: string
  agent: 'optimist' | 'skeptic'
  argument: string
  round: number
  timestamp: string
}

interface DebateState {
  topic: string
  debateHistory: DebateMessage[]
  phase: 'setup' | 'debating' | 'concluded'
  conclusion: unknown | null
  isStreaming: boolean
  maxRounds: number
  currentRound: number
  suggestions: string[]
}

const initialState: DebateState = {
  topic: '',
  debateHistory: [],
  phase: 'setup',
  conclusion: null,
  isStreaming: false,
  maxRounds: 4,
  currentRound: 0,
  suggestions: [],
}

const debateSlice = createSlice({
  name: 'debate',
  initialState,
  reducers: {
    setTopic(state, action: PayloadAction<string>) {
      state.topic = action.payload
    },
    addArgument(state, action: PayloadAction<DebateMessage>) {
      state.debateHistory.push(action.payload)
    },
    setPhase(state, action: PayloadAction<'setup' | 'debating' | 'concluded'>) {
      state.phase = action.payload
    },
    setConclusion(state, action: PayloadAction<unknown>) {
      state.conclusion = action.payload
    },
    setStreaming(state, action: PayloadAction<boolean>) {
      state.isStreaming = action.payload
    },
    setCurrentRound(state, action: PayloadAction<number>) {
      state.currentRound = action.payload
    },
    setMaxRounds(state, action: PayloadAction<number>) {
      state.maxRounds = action.payload
    },
    setSuggestions(state, action: PayloadAction<string[]>) {
      state.suggestions = action.payload
    },
    resetDebate(state) {
      state.topic = ''
      state.debateHistory = []
      state.phase = 'setup'
      state.conclusion = null
      state.isStreaming = false
      state.currentRound = 0
    },
  },
})

export const {
  setTopic,
  addArgument,
  setPhase,
  setConclusion,
  setStreaming,
  setCurrentRound,
  setMaxRounds,
  setSuggestions,
  resetDebate,
} = debateSlice.actions
export default debateSlice.reducer
