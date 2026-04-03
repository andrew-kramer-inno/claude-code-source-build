/**
 * [MOD] SleepTool — interrupt-responsive sleep for KAIROS/proactive mode.
 *
 * Provides a non-blocking sleep that doesn't hold a shell process (unlike
 * Bash sleep). The user can interrupt at any time. Used by the model to
 * pace itself between ticks in proactive/assistant mode.
 */

import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { sleep } from '../../utils/sleep.js'
import { SLEEP_TOOL_NAME, DESCRIPTION, SLEEP_TOOL_PROMPT } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    duration_seconds: z
      .number()
      .positive()
      .describe('The duration to sleep in seconds'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    slept_seconds: z.number().describe('Actual duration slept in seconds'),
    interrupted: z.boolean().describe('Whether sleep was interrupted by user input'),
  }),
)

// Lazy import to avoid circular dependency at module init
let _isProactiveActive: (() => boolean) | null = null
function getIsProactiveActive(): boolean {
  if (!_isProactiveActive) {
    try {
      const mod = require('../../proactive/index.js') as typeof import('../../proactive/index.js')
      _isProactiveActive = mod.isProactiveActive
    } catch {
      return false
    }
  }
  return _isProactiveActive()
}

export const SleepTool = buildTool({
  name: SLEEP_TOOL_NAME,

  async description() {
    return DESCRIPTION
  },

  async prompt() {
    return SLEEP_TOOL_PROMPT
  },

  inputSchema,
  outputSchema,

  isEnabled() {
    // SleepTool is only available when proactive/assistant mode is active
    return getIsProactiveActive()
  },

  isReadOnly() {
    return true
  },

  isConcurrencySafe() {
    return true
  },

  interruptBehavior() {
    return 'cancel' as const
  },

  async call(
    { duration_seconds },
    context,
  ) {
    const startMs = Date.now()
    const signal = context.abortController.signal

    // Sleep with abort support
    await sleep(duration_seconds * 1000, signal)

    const elapsedMs = Date.now() - startMs
    const sleptSeconds = Math.round(elapsedMs / 100) / 10 // 1 decimal place
    const interrupted = signal.aborted

    return {
      data: {
        slept_seconds: sleptSeconds,
        interrupted,
      },
    }
  },

  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const text = content.interrupted
      ? `Slept for ${content.slept_seconds}s (interrupted by user)`
      : `Slept for ${content.slept_seconds}s`
    return {
      type: 'tool_result',
      tool_use_id: toolUseID,
      content: text,
    }
  },

  renderToolUseMessage(input) {
    // Minimal — just show duration
    const React = require('react')
    const { Text } = require('../../ink.js')
    return React.createElement(Text, { dimColor: true },
      `⏱ Sleep ${input.duration_seconds}s`)
  },
})
