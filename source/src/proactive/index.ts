/**
 * [MOD] Proactive module — background ticking engine for KAIROS/proactive mode.
 *
 * Manages autonomous tick scheduling: periodic <tick> prompts that wake the
 * model to look for useful work. Supports pause/resume, context blocking
 * (suppresses ticks during API errors), and React external store subscriptions.
 */

// ── Internal state ──────────────────────────────────────────────────────

let _active = false
let _paused = false
let _contextBlocked = false
let _nextTickAt: number | null = null
let _tickTimer: ReturnType<typeof setTimeout> | null = null

const _subscribers = new Set<() => void>()

function _notify(): void {
  for (const cb of _subscribers) {
    try {
      cb()
    } catch {
      // subscriber threw — ignore
    }
  }
}

// ── Tick scheduling ─────────────────────────────────────────────────────

const DEFAULT_TICK_INTERVAL_MS = 60_000 // 1 minute between ticks

function _scheduleTick(onTick: ((prompt: string) => void) | null): void {
  _clearTick()
  if (!_active || _paused || _contextBlocked || !onTick) return

  const intervalMs = Number(process.env.CLAUDE_CODE_PROACTIVE_TICK_MS) || DEFAULT_TICK_INTERVAL_MS
  _nextTickAt = Date.now() + intervalMs
  _notify()

  _tickTimer = setTimeout(() => {
    _nextTickAt = null
    if (_active && !_paused && !_contextBlocked) {
      const now = new Date()
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      onTick(`<tick>${timeStr}</tick>`)
    }
    // Re-schedule for next tick
    _scheduleTick(onTick)
  }, intervalMs)
}

function _clearTick(): void {
  if (_tickTimer) {
    clearTimeout(_tickTimer)
    _tickTimer = null
  }
  _nextTickAt = null
}

// ── Stored tick callback ────────────────────────────────────────────────
let _onTick: ((prompt: string) => void) | null = null

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Whether proactive mode is currently active.
 * Used as a React external store snapshot.
 */
export function isProactiveActive(): boolean {
  return _active
}

/**
 * Activate proactive mode. Starts the tick scheduler.
 * @param source - Identifier for what triggered activation (e.g., 'command', 'cli-flag')
 */
export function activateProactive(source: string): void {
  if (_active) return
  _active = true
  _paused = false
  _contextBlocked = false
  _notify()
  _scheduleTick(_onTick)
}

/**
 * Deactivate proactive mode. Stops all ticking.
 */
export function deactivateProactive(): void {
  _active = false
  _paused = false
  _contextBlocked = false
  _clearTick()
  _notify()
}

/**
 * Pause proactive ticking (e.g., when user takes control of input).
 */
export function pauseProactive(): void {
  if (!_active || _paused) return
  _paused = true
  _clearTick()
  _notify()
}

/**
 * Resume proactive ticking after a pause.
 */
export function resumeProactive(): void {
  if (!_active || !_paused) return
  _paused = false
  _notify()
  _scheduleTick(_onTick)
}

/**
 * Whether proactive mode is currently paused.
 */
export function isProactivePaused(): boolean {
  return _paused
}

/**
 * Block/unblock ticking due to context issues (API errors, rate limits).
 * When blocked, no ticks fire to avoid runaway error loops.
 */
export function setContextBlocked(blocked: boolean): void {
  const changed = _contextBlocked !== blocked
  _contextBlocked = blocked
  if (changed) {
    if (blocked) {
      _clearTick()
    } else if (_active && !_paused) {
      _scheduleTick(_onTick)
    }
    _notify()
  }
}

/**
 * Returns timestamp (ms) of next scheduled tick, or null if no tick is pending.
 * Used with React's useSyncExternalStore for countdown UI.
 */
export function getNextTickAt(): number | null {
  return _nextTickAt
}

/**
 * React external store subscription. Returns an unsubscribe function.
 */
export function subscribeToProactiveChanges(callback: () => void): () => void {
  _subscribers.add(callback)
  return () => {
    _subscribers.delete(callback)
  }
}

/**
 * Set the tick callback. Called by useProactive hook to wire up the
 * REPL's handleIncomingPrompt / enqueue functions.
 */
export function setTickCallback(onTick: ((prompt: string) => void) | null): void {
  _onTick = onTick
  if (_active && !_paused && !_contextBlocked && onTick) {
    _scheduleTick(onTick)
  }
}
