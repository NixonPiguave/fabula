import { useEffect, useRef, type RefObject } from 'react'

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  close: () => void,
  enabled = true
) {
  const latestClose = useRef(close)
  latestClose.current = close
  useEffect(() => {
    if (!enabled) return
    const previous = document.activeElement as HTMLElement | null
    const element = ref.current
    if (!element) return
    const controls = () => [
      ...element.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'
      )
    ]
    controls()[0]?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        latestClose.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = controls(),
        first = items[0],
        last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    element.addEventListener('keydown', handler)
    return () => {
      element.removeEventListener('keydown', handler)
      previous?.focus()
    }
  }, [ref, enabled])
}
