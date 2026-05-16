'use client'

import { createContext, useContext } from 'react'
import { FEATURED_BOOKMAKER_KEYS } from '@/lib/affiliates'

/**
 * Provides the list of bookmaker keys that should be shown on fight cards.
 * Defaults to the 3 featured books when no provider is present.
 */
const BookmakerContext = createContext<string[]>(FEATURED_BOOKMAKER_KEYS)

export function BookmakerProvider({
  keys,
  children,
}: {
  keys: string[]
  children: React.ReactNode
}) {
  return (
    <BookmakerContext.Provider value={keys}>
      {children}
    </BookmakerContext.Provider>
  )
}

export function useVisibleBookmakerKeys(): string[] {
  return useContext(BookmakerContext)
}
