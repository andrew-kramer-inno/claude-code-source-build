/**
 * [MOD] useProactive hook — React integration for proactive ticking.
 *
 * Wires the REPL's submit/queue callbacks into the proactive tick scheduler.
 * Called from REPL.tsx when feature('PROACTIVE') || feature('KAIROS') is true.
 */

import { useEffect, useRef } from 'react'
import { isProactiveActive, setTickCallback } from './index.js'

interface UseProactiveOptions {
  isLoading: boolean
  queuedCommandsLength: number
  hasActiveLocalJsxUI: boolean
  isInPlanMode: boolean
  onSubmitTick: (prompt: string) => void
  onQueueTick: (prompt: string) => void
}

/**
 * React hook that connects proactive tick scheduling to the REPL.
 *
 * - When not loading and no queued commands: use onSubmitTick (direct submit)
 * - When loading or commands queued: use onQueueTick (enqueue for later)
 * - Suppressed when local JSX UI is active or in plan mode
 */
export function useProactive(options: UseProactiveOptions): void {
  const {
    isLoading,
    queuedCommandsLength,
    hasActiveLocalJsxUI,
    isInPlanMode,
    onSubmitTick,
    onQueueTick,
  } = options

  const onSubmitTickRef = useRef(onSubmitTick)
  const onQueueTickRef = useRef(onQueueTick)
  onSubmitTickRef.current = onSubmitTick
  onQueueTickRef.current = onQueueTick

  useEffect(() => {
    if (!isProactiveActive()) return

    // Suppress ticks when UI is busy or in plan mode
    if (hasActiveLocalJsxUI || isInPlanMode) {
      setTickCallback(null)
      return () => setTickCallback(null)
    }

    // Route ticks through the appropriate channel
    const handler = (prompt: string) => {
      if (isLoading || queuedCommandsLength > 0) {
        onQueueTickRef.current(prompt)
      } else {
        onSubmitTickRef.current(prompt)
      }
    }

    setTickCallback(handler)
    return () => setTickCallback(null)
  }, [isLoading, queuedCommandsLength, hasActiveLocalJsxUI, isInPlanMode])
}
