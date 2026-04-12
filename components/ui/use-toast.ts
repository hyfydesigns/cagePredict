'use client'

import * as React from 'react'

const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 4000

type ToastVariant = 'default' | 'destructive' | 'success'

export type Toast = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  duration?: number
}

type Action =
  | { type: 'ADD'; toast: Toast }
  | { type: 'REMOVE'; id: string }

let count = 0
function genId() { return `${++count}` }

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case 'ADD':
      return [action.toast, ...state].slice(0, TOAST_LIMIT)
    case 'REMOVE':
      return state.filter((t) => t.id !== action.id)
    default:
      return state
  }
}

const listeners: Array<(state: Toast[]) => void> = []
let memoryState: Toast[] = []

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((l) => l(memoryState))
}

export function toast(props: Omit<Toast, 'id'>) {
  const id = genId()
  const duration = props.duration ?? TOAST_REMOVE_DELAY

  dispatch({ type: 'ADD', toast: { id, ...props } })

  const timeout = setTimeout(() => {
    dispatch({ type: 'REMOVE', id })
    toastTimeouts.delete(id)
  }, duration)
  toastTimeouts.set(id, timeout)

  return { id }
}

export function useToast() {
  const [toasts, setToasts] = React.useState<Toast[]>(memoryState)

  React.useEffect(() => {
    listeners.push(setToasts)
    return () => {
      const idx = listeners.indexOf(setToasts)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  return {
    toasts,
    toast,
    dismiss: (id: string) => dispatch({ type: 'REMOVE', id }),
  }
}
