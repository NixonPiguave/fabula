import { useRef, useState } from 'react'
import type { PlaybackState } from '../../shared/studio'

export function useReadingState(error: (reason: unknown) => void) {
  const state = useRef<PlaybackState>({ currentId: null, positions: {}, bookmarks: {} })
  const [bookmarks, setBookmarks] = useState<PlaybackState['bookmarks']>({})
  const lastWrite = useRef(0)
  function persist() {
    lastWrite.current = Date.now()
    window.fabula?.savePlayback(structuredClone(state.current)).catch(error)
  }
  return {
    bookmarks,
    initialize(value: PlaybackState) {
      state.current = structuredClone(value)
      setBookmarks(value.bookmarks)
    },
    position(id: string) {
      return state.current.positions[id] ?? 0
    },
    forget(id: string) {
      delete state.current.positions[id]
      delete state.current.bookmarks[id]
      if (state.current.currentId === id) state.current.currentId = null
      state.current.bookmarks = { ...state.current.bookmarks }
      setBookmarks(state.current.bookmarks)
      persist()
    },
    select(id: string | null) {
      if (state.current.currentId !== id) {
        state.current.currentId = id
        persist()
      }
    },
    savePosition(id: string | null, seconds: number, force = false) {
      if (!id || !Number.isFinite(seconds)) return
      state.current.positions[id] = Math.max(0, seconds)
      if (force || Date.now() - lastWrite.current > 2000) persist()
    },
    add(id: string, label: string, seconds: number) {
      const entries = state.current.bookmarks[id] ?? []
      if (entries.length >= 1000) return
      state.current.bookmarks = {
        ...state.current.bookmarks,
        [id]: [...entries, { id: crypto.randomUUID(), label, seconds }]
      }
      setBookmarks(state.current.bookmarks)
      persist()
    },
    remove(id: string, bookmark: string) {
      state.current.bookmarks = {
        ...state.current.bookmarks,
        [id]: (state.current.bookmarks[id] ?? []).filter((entry) => entry.id !== bookmark)
      }
      setBookmarks(state.current.bookmarks)
      persist()
    }
  }
}
