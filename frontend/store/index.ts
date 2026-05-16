import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'

import authReducer from './slices/authSlice'
import agentReducer from './slices/agentSlice'
import ragReducer from './slices/ragSlice'
import debateReducer from './slices/debateSlice'
import uiReducer from './slices/uiSlice'

const persistConfig = {
  key: 'datastraw-root',
  storage,
  whitelist: ['auth', 'ui', 'agent', 'rag', 'debate'],
}

const rootReducer = combineReducers({
  auth: authReducer,
  agent: agentReducer,
  rag: ragReducer,
  debate: debateReducer,
  ui: uiReducer,
})

const persistedReducer = persistReducer(persistConfig, rootReducer)

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          'persist/PERSIST',
          'persist/REHYDRATE',
          'persist/REGISTER',
          'persist/FLUSH',
          'persist/PURGE',
          'persist/PAUSE',
        ],
      },
    }),
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
