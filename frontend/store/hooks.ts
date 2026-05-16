import { useDispatch, useSelector } from 'react-redux'
import type { RootState, AppDispatch } from './index'

export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector)

// Convenience selectors
export const useAuth = () => useAppSelector(state => state.auth)
export const useAgentState = () => useAppSelector(state => state.agent)
export const useRAGState = () => useAppSelector(state => state.rag)
export const useDebateState = () => useAppSelector(state => state.debate)
export const useUIState = () => useAppSelector(state => state.ui)
